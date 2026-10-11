export function benchmarkThreads(available: number): number {
  return Number.isFinite(available) ? Math.max(1, Math.min(4, Math.floor(available / 2))) : 1
}

const WORKER_CODE = `
onmessage = async () => {
  let value = 1.1
  let operations = 0
  const start = performance.now()
  const warmup = 200
  const duration = 1700
  while (performance.now() - start < duration) {
    const sliceStart = performance.now()
    const measured = sliceStart - start >= warmup
    while (performance.now() - sliceStart < 8) {
      for (let iteration = 0; iteration < 2000; iteration++) {
        value = Math.sin(value) * Math.sqrt(iteration + 2) + Math.cos(value * 1.3)
        value = value % 10 + 1.0001
      }
      if (measured) operations += 2000
    }
    await new Promise(resolve => setTimeout(resolve, 8))
  }
  postMessage({ score: operations / ((performance.now() - start - warmup) / 1000), checksum: value })
}
`

export async function runCpuWorkers(count: number, signal: AbortSignal): Promise<number> {
  signal.throwIfAborted()
  const url = URL.createObjectURL(new Blob([WORKER_CODE], { type: 'application/javascript' }))
  const workers: Worker[] = []
  const guards: ReturnType<typeof setTimeout>[] = []
  const aborters: (() => void)[] = []
  try {
    const scores = await Promise.all(Array.from({ length: Math.max(1, Math.min(4, count)) }, () =>
      new Promise<number>((resolve, reject) => {
        const worker = new Worker(url)
        workers.push(worker)
        const abort = (): void => reject(signal.reason)
        aborters.push(abort)
        signal.addEventListener('abort', abort, { once: true })
        const guard = setTimeout(() => reject(new Error('CPU benchmark timed out')), 15_000)
        guards.push(guard)
        worker.onerror = (event) => reject(new Error(event.message || 'Worker failed'))
        worker.onmessage = (event) => {
          const { score, checksum } = event.data ?? {}
          if (!Number.isFinite(score) || score <= 0 || !Number.isFinite(checksum)) {
            reject(new Error('Invalid CPU result'))
          } else {
            clearTimeout(guard)
            worker.terminate()
            resolve(score)
          }
        }
        worker.postMessage(null)
      })
    ))
    return Math.round(scores.reduce((sum, score) => sum + score, 0) / 1000)
  } finally {
    workers.forEach((worker) => worker.terminate())
    guards.forEach(clearTimeout)
    aborters.forEach((abort) => signal.removeEventListener('abort', abort))
    URL.revokeObjectURL(url)
  }
}

interface GpuTimerExtension {
  TIME_ELAPSED_EXT: number
  GPU_DISJOINT_EXT: number
}

export async function runGpuBench(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<{
  fps: number | null; renderer: string; gpuMs: number | null; error?: string
}> {
  signal.throwIfAborted()
  const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'default' })
  if (!gl) return { fps: null, renderer: '', gpuMs: null }
  const debug = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : ''
  const shaders: WebGLShader[] = []
  const program = gl.createProgram()
  const buffer = gl.createBuffer()
  let fence: WebGLSync | null = null
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimerExtension | null
  let query: WebGLQuery | null = null
  let queryMeasured = false
  let timingInvalid = false
  const gpuTimes: number[] = []
  try {
    if (!program || !buffer) throw new Error('WebGL allocation failed')
    const sources = [
      [gl.VERTEX_SHADER, `#version 300 es
        in vec2 position; out vec2 uv;
        void main() { uv = position; gl_Position = vec4(position, 0.0, 1.0); }`],
      [gl.FRAGMENT_SHADER, `#version 300 es
        precision highp float; in vec2 uv; uniform float time; out vec4 outputColor;
        float scene(vec3 p) {
          float a = time * 0.7;
          p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
          float sphere = length(p - vec3(0.8, 0.2, 0.0)) - 0.8;
          float ring = length(vec2(length(p.xy) - 1.25, p.z)) - 0.22;
          return min(min(sphere, ring), p.y + 1.15);
        }
        void main() {
          vec3 origin = vec3(0.0, 0.3, 4.0);
          vec3 direction = normalize(vec3(uv.x * 1.77778, uv.y, -2.0));
          float travel = 0.0;
          bool hit = false;
          for (int i = 0; i < 64; i++) {
            float distanceToScene = scene(origin + direction * travel);
            if (distanceToScene < 0.002) { hit = true; break; }
            travel += distanceToScene;
            if (travel > 15.0) break;
          }
          vec3 color = vec3(0.025, 0.04, 0.09) + 0.06 * max(direction.y, 0.0);
          if (hit) {
            vec3 p = origin + direction * travel;
            vec2 e = vec2(0.002, 0.0);
            vec3 normal = normalize(vec3(
              scene(p + e.xyy) - scene(p - e.xyy),
              scene(p + e.yxy) - scene(p - e.yxy),
              scene(p + e.yyx) - scene(p - e.yyx)));
            vec3 light = normalize(vec3(-0.6, 0.8, 0.7));
            float diffuse = max(dot(normal, light), 0.0);
            float specular = pow(max(dot(reflect(-light, normal), -direction), 0.0), 32.0);
            vec3 base = p.y < -1.1
              ? mix(vec3(0.09), vec3(0.2), mod(floor(p.x * 2.0) + floor(p.z * 2.0), 2.0))
              : 0.45 + 0.35 * cos(vec3(0.0, 2.0, 4.0) + p.x + time);
            color = base * (0.2 + diffuse * 0.8) + specular * 0.7;
            color = mix(color, vec3(0.025, 0.04, 0.09), min(travel / 20.0, 0.8));
          }
          outputColor = vec4(sqrt(max(color, vec3(0.0))), 1.0);
        }`]
    ] as const
    for (const [type, source] of sources) {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('WebGL shader allocation failed')
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('WebGL shader compilation failed')
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('WebGL program link failed')
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const location = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
    const time = gl.getUniformLocation(program, 'time')
    const start = performance.now()
    let measuredStart = 0
    let frames = 0
    let frameStart = start
    await new Promise<void>((resolve, reject) => {
      let timerHandle: ReturnType<typeof setTimeout>
      const finish = (error?: unknown): void => {
        clearTimeout(timerHandle)
        signal.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve()
      }
      const abort = (): void => finish(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      const step = (): void => {
        try {
          signal.throwIfAborted()
          if (gl.isContextLost()) throw new Error('WebGL context lost')
          const now = performance.now()
          if (timer && gl.getParameter(timer.GPU_DISJOINT_EXT)) timingInvalid = true
          if (fence) {
            const status = gl.clientWaitSync(fence, 0, 0)
            if (status === gl.WAIT_FAILED) throw new Error('WebGL sync failed')
            if (status === gl.TIMEOUT_EXPIRED) {
              if (now - frameStart > 2000) throw new Error('GPU benchmark timed out')
              timerHandle = setTimeout(step, 16)
              return
            }
            gl.deleteSync(fence)
            fence = null
            if (measuredStart) frames++
            else if (now - start >= 300) measuredStart = now
          }
          if (query && timer) {
            if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
              if (now - frameStart > 2000) throw new Error('GPU timer query timed out')
              timerHandle = setTimeout(step, 16)
              return
            }
            const ns: unknown = gl.getQueryParameter(query, gl.QUERY_RESULT)
            if (queryMeasured && typeof ns === 'number' && Number.isFinite(ns) && ns > 0) gpuTimes.push(ns / 1_000_000)
            else if (queryMeasured) timingInvalid = true
            gl.deleteQuery(query)
            query = null
          }
          if (measuredStart && now - measuredStart >= 3000) {
            finish()
            return
          }
          gl.viewport(0, 0, canvas.width, canvas.height)
          gl.clearColor(0.04, 0.05, 0.08, 1)
          gl.clear(gl.COLOR_BUFFER_BIT)
          gl.uniform1f(time, (now - start) / 1000)
          if (timer) {
            query = gl.createQuery()
            if (!query) throw new Error('GPU timer allocation failed')
            queryMeasured = measuredStart > 0
            gl.beginQuery(timer.TIME_ELAPSED_EXT, query)
          }
          gl.drawArrays(gl.TRIANGLES, 0, 3)
          if (timer) gl.endQuery(timer.TIME_ELAPSED_EXT)
          fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
          if (!fence) throw new Error('WebGL sync unavailable')
          gl.flush()
          frameStart = now
          timerHandle = setTimeout(step, 16)
        } catch (error) {
          finish(error)
        }
      }
      step()
    })
    return {
      fps: Math.round(frames * 1000 / Math.max(1, performance.now() - measuredStart)),
      renderer,
      gpuMs: !timingInvalid && gpuTimes.length >= 10
        ? gpuTimes.reduce((sum, ms) => sum + ms, 0) / gpuTimes.length : null
    }
  } catch (error) {
    if (signal.aborted) throw error
    console.error('[Pkaizen] GPU benchmark:', error)
    return { fps: null, renderer, gpuMs: null, error: error instanceof Error ? error.message : String(error) }
  } finally {
    if (fence) gl.deleteSync(fence)
    if (query) gl.deleteQuery(query)
    shaders.forEach((shader) => gl.deleteShader(shader))
    gl.deleteBuffer(buffer)
    gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
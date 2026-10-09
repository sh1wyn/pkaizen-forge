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

export async function runGpuBench(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<{ fps: number | null; renderer: string }> {
  signal.throwIfAborted()
  const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'default' })
  if (!gl) return { fps: null, renderer: '' }
  const debug = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : ''
  const shaders: WebGLShader[] = []
  const program = gl.createProgram()
  const buffer = gl.createBuffer()
  let fence: WebGLSync | null = null
  try {
    if (!program || !buffer) throw new Error('WebGL allocation failed')
    const sources = [
      [gl.VERTEX_SHADER, `#version 300 es
        in vec2 position; uniform float time; out vec3 color;
        void main() {
          float instance = float(gl_InstanceID);
          float angle = time * 0.4 + instance * 0.37;
          vec2 offset = vec2(cos(angle + instance), sin(angle * 1.3 + instance)) * 0.85;
          gl_Position = vec4(position * 0.025 + offset, 0.0, 1.0);
          color = vec3(mod(instance, 3.0)/3.0, mod(instance, 5.0)/5.0, mod(instance, 7.0)/7.0);
        }`],
      [gl.FRAGMENT_SHADER, `#version 300 es
        precision highp float; in vec3 color; out vec4 outputColor;
        void main() { outputColor = vec4(color * 0.7 + 0.3, 1.0); }`]
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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, -1, -1, 1, -1]), gl.STATIC_DRAW)
    const location = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
    const time = gl.getUniformLocation(program, 'time')
    const start = performance.now()
    let measuredStart = 0
    let frames = 0
    let frameStart = start
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>
      const finish = (error?: unknown): void => {
        clearTimeout(timer)
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
          if (fence) {
            const status = gl.clientWaitSync(fence, 0, 0)
            if (status === gl.WAIT_FAILED) throw new Error('WebGL sync failed')
            if (status === gl.TIMEOUT_EXPIRED) {
              if (now - frameStart > 2000) throw new Error('GPU benchmark timed out')
              timer = setTimeout(step, 16)
              return
            }
            gl.deleteSync(fence)
            fence = null
            if (measuredStart) frames++
            else if (now - start >= 300) measuredStart = now
          }
          if (measuredStart && now - measuredStart >= 3000) {
            finish()
            return
          }
          gl.viewport(0, 0, canvas.width, canvas.height)
          gl.clearColor(0.04, 0.05, 0.08, 1)
          gl.clear(gl.COLOR_BUFFER_BIT)
          gl.uniform1f(time, (now - start) / 1000)
          gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, 3000)
          fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
          if (!fence) throw new Error('WebGL sync unavailable')
          gl.flush()
          frameStart = now
          timer = setTimeout(step, 16)
        } catch (error) {
          finish(error)
        }
      }
      step()
    })
    return { fps: Math.round(frames * 1000 / Math.max(1, performance.now() - measuredStart)), renderer }
  } catch (error) {
    if (signal.aborted) throw error
    return { fps: null, renderer }
  } finally {
    if (fence) gl.deleteSync(fence)
    shaders.forEach((shader) => gl.deleteShader(shader))
    gl.deleteBuffer(buffer)
    gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
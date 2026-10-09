import { useEffect, useState } from 'react'
import type { DiskBenchResult } from '../../../shared/types'
import { useToast } from '../components/Toast'

interface BenchRun {
  date: string
  cpuSingle: number
  cpuMulti: number
  writeMBps: number
  readMBps: number
  gpuFps: number
  score: number
}

const HISTORY_KEY = 'pkaizen-bench-history'

const WORKER_CODE = `
onmessage = () => {
  const end = performance.now() + 1500
  let ops = 0
  let x = 1.1
  while (performance.now() < end) {
    for (let i = 0; i < 20000; i++) {
      x = Math.sin(x) * Math.sqrt(i + 2) + Math.cos(x * 1.3)
      x = x % 10 + 1.0001
    }
    ops += 20000
  }
  postMessage(Math.round(ops / 1.5))
}
`

function runCpuWorkers(count: number): Promise<number> {
  const url = URL.createObjectURL(new Blob([WORKER_CODE], { type: 'application/javascript' }))
  const workers = Array.from({ length: count }, () => new Worker(url))
  return Promise.all(
    workers.map(
      (w) =>
        new Promise<number>((resolve) => {
          w.onmessage = (e) => {
            resolve(e.data as number)
            w.terminate()
          }
          w.postMessage(null)
        })
    )
  ).then((scores) => {
    URL.revokeObjectURL(url)
    return Math.round(scores.reduce((a, b) => a + b, 0) / 1000)
  })
}

/** Scène WebGL lourde ~4s : mesure la moyenne de FPS de rendu. */
function runGpuBench(canvas: HTMLCanvasElement): Promise<number> {
  return new Promise((resolve) => {
    const gl = canvas.getContext('webgl2', { antialias: true })
    if (!gl) {
      resolve(0)
      return
    }
    const vs = `#version 300 es
    in vec2 p; uniform float t; out vec3 col;
    void main(){
      float i = float(gl_InstanceID);
      float a = t * (0.3 + mod(i, 7.0) * 0.1) + i * 0.37;
      vec2 o = vec2(cos(a + i), sin(a * 1.3 + i)) * (0.1 + mod(i, 83.0) / 100.0);
      gl_Position = vec4(p * 0.02 + o, 0.0, 1.0);
      col = vec3(mod(i,3.0)/3.0, mod(i,5.0)/5.0, mod(i,7.0)/7.0);
    }`
    const fs = `#version 300 es
    precision highp float; in vec3 col; out vec4 o;
    void main(){ float acc = 0.0; for (int k=0;k<24;k++){ acc += sin(col.x*float(k)+col.y*19.0); } o = vec4(col*0.7+acc*0.001+0.3, 1.0); }`
    const prog = gl.createProgram()!
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs]
    ] as const) {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      gl.attachShader(prog, sh)
    }
    gl.linkProgram(prog)
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, -1, -1, 1, -1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const tLoc = gl.getUniformLocation(prog, 't')

    let frames = 0
    const start = performance.now()
    const DURATION = 4000
    const INSTANCES = 30000
    const loop = (): void => {
      const t = (performance.now() - start) / 1000
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0.04, 0.05, 0.08, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(tLoc, t)
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, INSTANCES)
      frames++
      if (performance.now() - start < DURATION) requestAnimationFrame(loop)
      else resolve(Math.round(frames / (DURATION / 1000)))
    }
    requestAnimationFrame(loop)
  })
}

export default function Benchmark(): React.JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'cpu1' | 'cpuN' | 'disk' | 'gpu'>('idle')
  const [result, setResult] = useState<BenchRun | null>(null)
  const [history, setHistory] = useState<BenchRun[]>([])
  const toast = useToast()

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'))
    } catch {
      setHistory([])
    }
  }, [])

  const run = async (): Promise<void> => {
    try {
      setResult(null)
      setPhase('cpu1')
      const cpuSingle = await runCpuWorkers(1)
      setPhase('cpuN')
      const cpuMulti = await runCpuWorkers(navigator.hardwareConcurrency || 4)
      setPhase('disk')
      const disk: DiskBenchResult = await window.api.diskBench()
      setPhase('gpu')
      const canvas = document.getElementById('bench-canvas') as HTMLCanvasElement
      canvas.width = 800
      canvas.height = 500
      const gpuFps = await runGpuBench(canvas)

      const score = Math.round(cpuSingle * 2 + cpuMulti + disk.readMBps / 20 + disk.writeMBps / 20 + gpuFps * 3)
      const runData: BenchRun = {
        date: new Date().toLocaleString('fr-FR'),
        cpuSingle,
        cpuMulti,
        writeMBps: disk.writeMBps,
        readMBps: disk.readMBps,
        gpuFps,
        score
      }
      setResult(runData)
      const newHistory = [runData, ...history].slice(0, 10)
      setHistory(newHistory)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
      toast('Benchmark terminé ✔', 'success')
    } catch {
      toast('Erreur pendant le benchmark', 'error')
    }
    setPhase('idle')
  }

  const prev = history.length > 1 && result ? history[1] : null
  const delta = prev && result ? Math.round(((result.score - prev.score) / prev.score) * 100) : null

  const PHASE_LABEL: Record<string, string> = {
    cpu1: '🧮 Test CPU — 1 cœur…',
    cpuN: '🧮 Test CPU — tous les cœurs…',
    disk: '💾 Test disque (lecture/écriture 256 Mo)…',
    gpu: '🎨 Test GPU (rendu WebGL)…'
  }

  return (
    <>
      <h1>Benchmark</h1>
      <p className="subtitle">
        Mesure CPU, disque et GPU en ~15 secondes. Lance-le avant puis après tes optimisations pour voir le gain réel —
        et compare ton score avec tes potes.
      </p>

      <div className="banner info">
        💡 Pour un résultat fiable : ferme les jeux et les gros programmes avant de lancer. L\u2019indice GPU mesure le
        rendu de l\u2019app (comparable entre runs et entre PC), pas les FPS d\u2019un jeu précis.
      </div>

      <div className="toolbar">
        <button className="btn primary" disabled={phase !== 'idle'} onClick={run}>
          {phase !== 'idle' ? <span className="spinner" /> : '🧪'} Lancer le benchmark
        </button>
        {phase !== 'idle' && <span className="muted">{PHASE_LABEL[phase]}</span>}
      </div>

      <canvas id="bench-canvas" style={{ width: phase === 'gpu' ? 400 : 0, height: phase === 'gpu' ? 250 : 0, borderRadius: 12 }} />

      {result && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="score-ring">
              <div className="score-num">{result.score}</div>
              <div style={{ flex: 1 }}>
                <div className="big">Indice Pkaizen</div>
                <div className="sub">
                  {delta != null
                    ? delta > 0
                      ? `+${delta}% par rapport au run précédent 📈`
                      : delta < 0
                        ? `${delta}% par rapport au run précédent 📉 (vérifie ce qui tourne en fond)`
                        : 'Identique au run précédent'
                    : 'Premier run — relance après tes optimisations pour comparer.'}
                </div>
              </div>
            </div>
          </div>
          <div className="grid">
            <div className="card stagger">
              <h3>CPU — 1 cœur</h3>
              <div className="big">{result.cpuSingle} pts</div>
              <div className="sub">Déterminant pour les FPS dans la plupart des jeux.</div>
            </div>
            <div className="card stagger">
              <h3>CPU — multi-cœurs</h3>
              <div className="big">{result.cpuMulti} pts</div>
              <div className="sub">{navigator.hardwareConcurrency} threads utilisés.</div>
            </div>
            <div className="card stagger">
              <h3>Disque — écriture</h3>
              <div className="big">{result.writeMBps} Mo/s</div>
              <div className="sub">{result.writeMBps > 1000 ? 'Niveau NVMe ✔' : result.writeMBps > 350 ? 'Niveau SSD SATA' : 'Lent — HDD ou SSD saturé ⚠'}</div>
            </div>
            <div className="card stagger">
              <h3>Disque — lecture</h3>
              <div className="big">{result.readMBps} Mo/s</div>
              <div className="sub">Impacte les temps de chargement des jeux.</div>
            </div>
            <div className="card stagger">
              <h3>GPU — rendu</h3>
              <div className="big">{result.gpuFps} FPS</div>
              <div className="sub">Scène WebGL lourde — comparable entre runs/PC.</div>
            </div>
          </div>
        </>
      )}

      {history.length > 0 && (
        <>
          <div className="section-title">📜 Historique (10 derniers runs)</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Indice</th>
                <th>CPU 1c</th>
                <th>CPU multi</th>
                <th>Écriture</th>
                <th>Lecture</th>
                <th>GPU</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="muted">{h.date}</td>
                  <td>
                    <b>{h.score}</b>
                  </td>
                  <td>{h.cpuSingle}</td>
                  <td>{h.cpuMulti}</td>
                  <td>{h.writeMBps} Mo/s</td>
                  <td>{h.readMBps} Mo/s</td>
                  <td>{h.gpuFps} FPS</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}

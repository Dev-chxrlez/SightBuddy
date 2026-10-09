import { forwardRef, useImperativeHandle, useRef } from 'react'

const COLORS = ['#5fffb0', '#ffd166', '#66c7ff', '#ff7b9c', '#c7a6ff']

const CameraView = forwardRef(function CameraView({ active, detections, dimensions }, ref) {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)

  useImperativeHandle(ref, () => ({
    video: videoRef.current,
    setStream(stream) {
      if (videoRef.current) videoRef.current.srcObject = stream
    },
    clearStream() {
      if (videoRef.current) videoRef.current.srcObject = null
    },
    captureFrame(maxDimension = 768) {
      const video = videoRef.current
      if (!video?.videoWidth || !video?.videoHeight || video.readyState < 2) {
        throw new Error('The camera does not have a fresh frame yet.')
      }

      const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight))
      const width = Math.max(1, Math.round(video.videoWidth * scale))
      const height = Math.max(1, Math.round(video.videoHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.drawImage(video, 0, 0, width, height)

      const sampleCanvas = document.createElement('canvas')
      sampleCanvas.width = 48
      sampleCanvas.height = 48
      const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
      sampleContext.drawImage(canvas, 0, 0, 48, 48)
      const pixels = sampleContext.getImageData(0, 0, 48, 48).data
      let brightness = 0
      let edgeDifference = 0
      const luminance = new Float32Array(48 * 48)
      for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
        const value = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
        luminance[pixel] = value
        brightness += value
      }
      for (let y = 1; y < 48; y += 1) {
        for (let x = 1; x < 48; x += 1) {
          const index = y * 48 + x
          edgeDifference += Math.abs(luminance[index] - luminance[index - 1])
            + Math.abs(luminance[index] - luminance[index - 48])
        }
      }

      return {
        dataUrl: canvas.toDataURL('image/jpeg', 0.84),
        width,
        height,
        sourceWidth: video.videoWidth,
        sourceHeight: video.videoHeight,
        brightness: brightness / luminance.length,
        edgeScore: edgeDifference / ((47 * 47) * 2),
      }
    },
  }))

  const ratio = dimensions.width && dimensions.height ? `${dimensions.width} / ${dimensions.height}` : '4 / 3'

  return (
    <div className="camera-shell" style={{ aspectRatio: ratio }}>
      <video ref={videoRef} className="camera-video" autoPlay muted playsInline aria-label="Rear camera preview" />
      <canvas
        ref={overlayRef}
        className="camera-overlay"
        width={dimensions.width || 640}
        height={dimensions.height || 480}
        aria-hidden="true"
      />
      {active && (
        <svg
          className="box-layer"
          viewBox={`0 0 ${dimensions.width || 640} ${dimensions.height || 480}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {detections.map((item, index) => (
            <g key={`${item.classId}-${index}-${Math.round(item.x1)}`}>
              <rect
                x={item.x1}
                y={item.y1}
                width={item.x2 - item.x1}
                height={item.y2 - item.y1}
                vectorEffect="non-scaling-stroke"
                style={{ '--box-color': COLORS[item.classId % COLORS.length] }}
              />
              <text x={item.x1 + 5} y={Math.max(item.y1 + 18, 22)}>
                {item.label}{Number.isFinite(item.score) ? ` ${Math.round(item.score * 100)}%` : ''}
              </text>
            </g>
          ))}
        </svg>
      )}
      {!active && (
        <div className="camera-placeholder">
          <span className="lens-icon" aria-hidden="true" />
          <p>Camera is off</p>
          <small>Your view stays on this device.</small>
        </div>
      )}
      {active && <span className="live-badge"><i /> LIVE</span>}
    </div>
  )
})

export default CameraView

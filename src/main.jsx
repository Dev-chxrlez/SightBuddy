import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Model initialization allocates substantial native/WASM memory. Avoid React
// StrictMode's development-only effect replay for this hardware resource.
createRoot(document.getElementById('root')).render(<App />)

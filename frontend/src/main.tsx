import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Staff from './Staff'
import './index.css'

const isDoctor = window.location.pathname === '/doctor' || window.location.pathname === '/staff'
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isDoctor ? <Staff /> : <App />}</React.StrictMode>,
)

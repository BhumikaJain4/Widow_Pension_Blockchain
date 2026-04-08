import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Web3Provider } from './context/Web3Context';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import ApplyPage from './pages/ApplyPage';
import StatusPage from './pages/StatusPage';
import ValidatorDashboard from './pages/ValidatorDashboard';
import AdminPanel from './pages/AdminPanel';

export default function App() {
  return (
    <Web3Provider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/apply"     element={<ApplyPage />} />
          <Route path="/status"    element={<StatusPage />} />
          <Route path="/validator" element={<ValidatorDashboard />} />
          <Route path="/admin"     element={<AdminPanel />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer
          position="top-right" autoClose={4000}
          hideProgressBar={false} newestOnTop closeOnClick pauseOnHover
          toastStyle={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}
        />
      </BrowserRouter>
    </Web3Provider>
  );
}

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MusicRecognition from './components/MusicRecognition';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
        <Routes>
          <Route path="/" element={<MusicRecognition />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
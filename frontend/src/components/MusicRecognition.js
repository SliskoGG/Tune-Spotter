import React, { useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

const MusicRecognition = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('file'); // 'file', 'url', 'record'
  const [url, setUrl] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

  // Reset state
  const resetState = () => {
    setResult(null);
    setError('');
  };

  // File upload handler
  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    resetState();
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API_BASE_URL}/api/recognize/file`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to recognize music from file');
    } finally {
      setIsLoading(false);
    }
  };

  // URL recognition handler
  const handleUrlRecognition = async () => {
    if (!url.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    resetState();
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('url', url);

      const response = await axios.post(`${API_BASE_URL}/api/recognize/url`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to recognize music from URL');
    } finally {
      setIsLoading(false);
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/wav' });
        await handleAudioRecognition(audioBlob);
        
        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      
      // Auto stop after 15 seconds
      setTimeout(() => {
        if (mediaRecorderRef.current && isRecording) {
          stopRecording();
        }
      }, 15000);
      
    } catch (err) {
      setError('Failed to access microphone. Please check permissions.');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Handle audio recognition from recording
  const handleAudioRecognition = async (audioBlob) => {
    resetState();
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.wav');

      const response = await axios.post(`${API_BASE_URL}/api/recognize/file`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to recognize recorded audio');
    } finally {
      setIsLoading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg']
    },
    multiple: false
  });

  return (
    <div className="hero-background min-h-screen">
      <div className="hero-content min-h-screen flex items-center justify-center p-4">
        
        {/* Floating background elements */}
        <div className="floating-notes text-6xl" style={{ top: '15%', left: '10%' }}>🎵</div>
        <div className="floating-notes text-4xl" style={{ top: '65%', left: '85%' }}>🎶</div>
        <div className="floating-notes text-5xl" style={{ top: '25%', left: '75%' }}>🎼</div>
        <div className="floating-notes text-3xl" style={{ top: '80%', left: '15%' }}>🎤</div>

        <div className="w-full max-w-5xl">
          {/* Enhanced Header */}
          <div className="text-center mb-12">
            <h1 className="title-gradient text-6xl md:text-7xl font-bold mb-6">
              🎵 TuneSpotter
            </h1>
            <p className="text-2xl text-white opacity-90 max-w-2xl mx-auto leading-relaxed">
              Discover any song instantly with our advanced AI-powered music recognition
            </p>
            <div className="mt-4 flex justify-center">
              <div className="audio-wave">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>

          {/* Enhanced Tab Navigation */}
          <div className="flex justify-center mb-10">
            <div className="tab-nav">
              {[
                { key: 'file', label: 'Upload File', icon: '📁' },
                { key: 'url', label: 'From URL', icon: '🔗' },
                { key: 'record', label: 'Record Live', icon: '🎤' }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key);
                    resetState();
                  }}
                  className={`tab-button px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 ${
                    activeTab === tab.key
                      ? 'active text-white'
                      : 'text-gray-200 hover:text-white'
                  }`}
                >
                  <span className="text-2xl mr-3">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Enhanced Main Content Area */}
          <div className="glass-card-strong rounded-3xl p-10 shadow-2xl">
            
            {/* File Upload Tab */}
            {activeTab === 'file' && (
              <div
                {...getRootProps()}
                className={`dropzone rounded-2xl p-16 text-center cursor-pointer transition-all duration-400 ${
                  isDragActive ? 'active' : ''
                }`}
              >
                <input {...getInputProps()} />
                <div className="text-8xl mb-6">🎵</div>
                <h3 className="text-3xl font-bold text-white mb-4">
                  {isDragActive ? 'Drop your music here!' : 'Upload Your Audio'}
                </h3>
                <p className="text-xl text-gray-200 mb-6 max-w-md mx-auto">
                  Drag & drop any audio file or click to browse your device
                </p>
                <div className="inline-flex items-center gap-4 text-sm text-gray-300">
                  <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">MP3</span>
                  <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">WAV</span>
                  <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">M4A</span>
                  <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">Max 10MB</span>
                </div>
              </div>
            )}

            {/* URL Input Tab */}
            {activeTab === 'url' && (
              <div className="text-center">
                <div className="text-8xl mb-8">🔗</div>
                <h3 className="text-3xl font-bold text-white mb-8">
                  Recognize from URL
                </h3>
                <div className="max-w-3xl mx-auto">
                  <div className="flex gap-4 mb-6">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="Paste YouTube, SoundCloud, or any music URL here..."
                      className="modern-input flex-1 px-6 py-4 rounded-xl text-white placeholder-gray-300 text-lg focus:outline-none"
                    />
                    <button
                      onClick={handleUrlRecognition}
                      disabled={!url.trim() || isLoading}
                      className="btn-primary px-10 py-4 rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed text-white"
                    >
                      {isLoading ? (
                        <div className="flex items-center gap-2">
                          <div className="loading-animation scale-50"></div>
                          Processing...
                        </div>
                      ) : (
                        'Recognize'
                      )}
                    </button>
                  </div>
                  <div className="flex justify-center gap-3 text-sm text-gray-300">
                    <span className="bg-red-500 bg-opacity-20 px-3 py-1 rounded-full">YouTube</span>
                    <span className="bg-orange-500 bg-opacity-20 px-3 py-1 rounded-full">SoundCloud</span>
                    <span className="bg-blue-500 bg-opacity-20 px-3 py-1 rounded-full">Direct Links</span>
                  </div>
                </div>
              </div>
            )}

            {/* Recording Tab */}
            {activeTab === 'record' && (
              <div className="text-center">
                <div className="text-8xl mb-8">🎤</div>
                <h3 className="text-3xl font-bold text-white mb-8">
                  Record Live Audio
                </h3>
                <div className="flex justify-center mb-8">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isLoading}
                    className={`record-button w-40 h-40 rounded-full text-white font-bold text-xl transition-all duration-300 ${
                      isRecording 
                        ? 'recording bg-red-500 hover:bg-red-600' 
                        : 'bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl`}
                  >
                    {isRecording ? (
                      <div>
                        <div className="text-4xl mb-2">⏹️</div>
                        <div className="text-lg">Stop</div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-4xl mb-2">🎤</div>
                        <div className="text-lg">Record</div>
                      </div>
                    )}
                  </button>
                </div>
                
                {isRecording && (
                  <div className="flex justify-center items-center gap-4 mb-6">
                    <div className="audio-wave scale-125">
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <span className="text-white font-bold text-xl">Recording Live Audio...</span>
                  </div>
                )}
                
                <div className="text-gray-300 space-y-2">
                  <p className="text-lg">Click the button to start recording</p>
                  <p className="text-sm opacity-75">Maximum 15 seconds • Auto-stop included</p>
                </div>
              </div>
            )}

            {/* Enhanced Loading State */}
            {isLoading && (
              <div className="glass-card rounded-2xl p-12 mt-8 text-center">
                <div className="loading-animation mx-auto mb-6"></div>
                <h3 className="text-2xl font-bold text-white mb-2">Analyzing Audio...</h3>
                <p className="text-gray-300 text-lg">Our AI is identifying your music</p>
                <div className="mt-4 audio-wave justify-center scale-75">
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}

            {/* Enhanced Error Display */}
            {error && (
              <div className="mt-8 glass-card error-gradient rounded-2xl p-6">
                <div className="flex items-center justify-center text-white">
                  <span className="text-3xl mr-4">⚠️</span>
                  <div>
                    <h3 className="text-xl font-bold mb-1">Recognition Failed</h3>
                    <p className="text-lg opacity-90">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Enhanced Results Display */}
            {result && (
              <div className="mt-8">
                {result.status === 'success' ? (
                  <div className="result-card glass-card success-gradient rounded-2xl p-8 text-white">
                    <div className="flex items-center justify-center mb-6">
                      <span className="text-4xl mr-4">🎵</span>
                      <h3 className="text-3xl font-bold">Song Identified!</h3>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-8 text-left">
                      <div className="space-y-4">
                        <div>
                          <span className="text-green-100 text-sm font-medium uppercase tracking-wide">Title</span>
                          <p className="text-2xl font-bold mt-1">{result.title || 'Unknown'}</p>
                        </div>
                        <div>
                          <span className="text-green-100 text-sm font-medium uppercase tracking-wide">Artist</span>
                          <p className="text-xl font-semibold mt-1">{result.artist || 'Unknown'}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <span className="text-green-100 text-sm font-medium uppercase tracking-wide">Album</span>
                          <p className="text-xl font-semibold mt-1">{result.album || 'Unknown'}</p>
                        </div>
                        <div>
                          <span className="text-green-100 text-sm font-medium uppercase tracking-wide">Confidence</span>
                          <div className="mt-2">
                            <div className="progress-bar h-3 mb-2">
                              <div 
                                className="progress-fill h-full transition-all duration-1000 ease-out"
                                style={{ width: `${(result.confidence || 0.85) * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-lg font-bold">{Math.round((result.confidence || 0.85) * 100)}% Match</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {result.release_date && (
                      <div className="mt-6 pt-6 border-t border-white border-opacity-30 text-center">
                        <span className="text-green-100 text-sm font-medium uppercase tracking-wide">Release Date</span>
                        <p className="text-xl font-semibold mt-1">{result.release_date}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="result-card glass-card warning-gradient rounded-2xl p-8 text-white">
                    <div className="flex items-center justify-center mb-6">
                      <span className="text-4xl mr-4">🤔</span>
                      <h3 className="text-3xl font-bold">No Match Found</h3>
                    </div>
                    <p className="text-center text-xl opacity-90 leading-relaxed">
                      {result.message || 'Unable to identify this audio. Try a clearer recording, different audio source, or ensure the music is well-known.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Enhanced Footer */}
          <div className="text-center mt-12">
            <div className="glass-card rounded-2xl p-6 inline-block">
              <p className="text-white text-lg font-medium">
                ✨ <span className="title-gradient">TuneSpotter</span> MVP ✨
              </p>
              <p className="text-gray-300 text-sm mt-1">
                Advanced AI Music Recognition • Files Auto-Deleted After Processing
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MusicRecognition;
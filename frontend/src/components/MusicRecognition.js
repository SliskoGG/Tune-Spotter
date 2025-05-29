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
      
      setAudioChunks(chunks);
      setAudioChunks(chunks);
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
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Floating background elements */}
      <div className="floating-notes text-6xl">🎵</div>
      <div className="floating-notes text-4xl" style={{ top: '60%', left: '80%', animationDelay: '2s' }}>🎶</div>
      <div className="floating-notes text-5xl" style={{ top: '20%', left: '70%', animationDelay: '4s' }}>🎼</div>

      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-4">
            🎵 TuneSpotter
          </h1>
          <p className="text-xl text-gray-300">
            Discover any song in seconds - Upload, paste URL, or record live music
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="bg-white bg-opacity-10 rounded-lg p-1 backdrop-blur-sm">
            {[
              { key: 'file', label: '📁 Upload File', icon: '📁' },
              { key: 'url', label: '🔗 From URL', icon: '🔗' },
              { key: 'record', label: '🎤 Record Audio', icon: '🎤' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  resetState();
                }}
                className={`px-6 py-3 rounded-md transition-all duration-300 ${
                  activeTab === tab.key
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-300 hover:text-white hover:bg-white hover:bg-opacity-10'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label.split(' ').slice(1).join(' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl">
          
          {/* File Upload Tab */}
          {activeTab === 'file' && (
            <div
              {...getRootProps()}
              className={`dropzone border-2 border-dashed rounded-xl p-12 text-center cursor-pointer ${
                isDragActive ? 'active border-blue-400 bg-blue-400 bg-opacity-10' : 'border-gray-400'
              }`}
            >
              <input {...getInputProps()} />
              <div className="text-6xl mb-4">🎵</div>
              <h3 className="text-2xl font-semibold text-white mb-2">
                {isDragActive ? 'Drop your audio file here' : 'Upload Audio File'}
              </h3>
              <p className="text-gray-300 mb-4">
                Drag & drop an audio file here, or click to browse
              </p>
              <p className="text-sm text-gray-400">
                Supports MP3, WAV, M4A, OGG • Max 10MB
              </p>
            </div>
          )}

          {/* URL Input Tab */}
          {activeTab === 'url' && (
            <div className="text-center">
              <div className="text-6xl mb-6">🔗</div>
              <h3 className="text-2xl font-semibold text-white mb-6">
                Recognize from URL
              </h3>
              <div className="flex gap-4 max-w-2xl mx-auto">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste YouTube, SoundCloud, or audio URL here..."
                  className="flex-1 px-4 py-3 rounded-lg bg-white bg-opacity-20 text-white placeholder-gray-400 border border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleUrlRecognition}
                  disabled={!url.trim() || isLoading}
                  className="btn-primary px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Processing...' : 'Recognize'}
                </button>
              </div>
              <p className="text-sm text-gray-400 mt-4">
                Works with YouTube, SoundCloud, and direct audio links
              </p>
            </div>
          )}

          {/* Recording Tab */}
          {activeTab === 'record' && (
            <div className="text-center">
              <div className="text-6xl mb-6">🎤</div>
              <h3 className="text-2xl font-semibold text-white mb-6">
                Record Live Audio
              </h3>
              <div className="flex justify-center mb-6">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isLoading}
                  className={`btn-primary w-32 h-32 rounded-full text-white font-bold text-xl transition-all duration-300 ${
                    isRecording 
                      ? 'bg-red-600 recording-pulse hover:bg-red-700' 
                      : 'bg-blue-600 hover:bg-blue-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isRecording ? (
                    <div>
                      <div className="text-2xl mb-1">⏹️</div>
                      <div className="text-sm">Stop</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-2xl mb-1">🎤</div>
                      <div className="text-sm">Record</div>
                    </div>
                  )}
                </button>
              </div>
              {isRecording && (
                <div className="flex justify-center items-center gap-3 mb-4">
                  <div className="audio-wave">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="text-white font-medium">Recording...</span>
                </div>
              )}
              <p className="text-sm text-gray-400">
                Click to start recording • Maximum 15 seconds
              </p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="loading-animation mx-auto mb-4"></div>
              <p className="text-white text-lg">Recognizing music...</p>
              <p className="text-gray-400 text-sm">This may take a few seconds</p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-8 p-4 bg-red-500 bg-opacity-20 border border-red-500 rounded-lg">
              <div className="flex items-center justify-center text-red-300">
                <span className="text-xl mr-2">⚠️</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Results Display */}
          {result && (
            <div className="mt-8">
              {result.status === 'success' ? (
                <div className="result-card bg-gradient-to-r from-green-400 to-blue-500 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-center mb-4">
                    <span className="text-3xl mr-3">🎵</span>
                    <h3 className="text-2xl font-bold">Song Identified!</h3>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div>
                        <span className="text-green-100 text-sm font-medium">Title:</span>
                        <p className="text-xl font-semibold">{result.title || 'Unknown'}</p>
                      </div>
                      <div>
                        <span className="text-green-100 text-sm font-medium">Artist:</span>
                        <p className="text-lg">{result.artist || 'Unknown'}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <span className="text-green-100 text-sm font-medium">Album:</span>
                        <p className="text-lg">{result.album || 'Unknown'}</p>
                      </div>
                      <div>
                        <span className="text-green-100 text-sm font-medium">Confidence:</span>
                        <div className="flex items-center gap-2">
                          <div className="bg-white bg-opacity-30 rounded-full h-2 flex-1">
                            <div 
                              className="bg-white h-2 rounded-full transition-all duration-500"
                              style={{ width: `${(result.confidence || 0.85) * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-sm">{Math.round((result.confidence || 0.85) * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {result.release_date && (
                    <div className="mt-4 pt-4 border-t border-white border-opacity-30">
                      <span className="text-green-100 text-sm font-medium">Release Date:</span>
                      <p className="text-lg">{result.release_date}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="result-card bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-center mb-4">
                    <span className="text-3xl mr-3">🤔</span>
                    <h3 className="text-2xl font-bold">No Match Found</h3>
                  </div>
                  <p className="text-center text-lg">
                    {result.message || 'Unable to identify this audio. Try a clearer recording or different audio source.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-400">
          <p className="text-sm">
            TuneSpotter MVP • Powered by advanced audio recognition technology
          </p>
        </div>
      </div>
    </div>
  );
};

export default MusicRecognition;
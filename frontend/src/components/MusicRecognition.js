import React, { useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

const MusicRecognition = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('file');
  const [url, setUrl] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [extractionResult, setExtractionResult] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

  const resetState = () => {
    setResult(null);
    setError('');
  };

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

  const handleUrlExtraction = async () => {
    if (!url.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    if (!startTime.trim() || !endTime.trim()) {
      setError('Please specify both start time and end time for extraction');
      return;
    }

    resetState();
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('url', url);
      formData.append('start_time', startTime);
      formData.append('end_time', endTime);

      const response = await axios.post(`${API_BASE_URL}/api/extract/url`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        responseType: 'blob', // Important for file download
      });

      // Create download link for the audio file
      const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
      const downloadUrl = window.URL.createObjectURL(audioBlob);
      
      // Extract filename from response headers or create one
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'extracted_audio.mp3';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      // Create and trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      // Show success message
      setExtractionResult({
        title: 'Audio extracted and downloaded successfully!',
        message: `File "${filename}" has been saved to your Downloads folder.`,
        status: 'success'
      });

    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to extract audio from URL');
    } finally {
      setIsLoading(false);
    }
  };

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
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      
      setTimeout(() => {
        if (mediaRecorderRef.current && isRecording) {
          stopRecording();
        }
      }, 15000);
      
    } catch (err) {
      setError('Failed to access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

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
    <div className="clean-background">
      <div className="container">
        <div className="stack">
          
          {/* Header */}
          <div className="center" style={{ flexDirection: 'column', paddingTop: '48px' }}>
            <h1 className="title">TuneSpotter</h1>
            <p className="subtitle">Identify any song from audio files, URLs, or live recording</p>
          </div>

          {/* Tab Navigation */}
          <div className="center">
            <div className="tab-container">
              <button
                onClick={() => { setActiveTab('file'); resetState(); }}
                className={`tab-button ${activeTab === 'file' ? 'active' : ''}`}
              >
                Upload File
              </button>
              <button
                onClick={() => { setActiveTab('url'); resetState(); }}
                className={`tab-button ${activeTab === 'url' ? 'active' : ''}`}
              >
                Extract Audio
              </button>
              <button
                onClick={() => { setActiveTab('record'); resetState(); }}
                className={`tab-button ${activeTab === 'record' ? 'active' : ''}`}
              >
                Recognize Music
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="card" style={{ padding: '32px' }}>
            
            {/* File Upload Tab */}
            {activeTab === 'file' && (
              <div>
                <h2 className="section-title">Upload Audio File</h2>
                <div
                  {...getRootProps()}
                  className={`dropzone ${isDragActive ? 'active' : ''}`}
                >
                  <input {...getInputProps()} />
                  <div style={{ marginBottom: '16px', fontSize: '48px' }}>📄</div>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '500', color: '#374151' }}>
                    {isDragActive ? 'Drop your file here' : 'Choose a file or drag it here'}
                  </h3>
                  <p className="text-body" style={{ margin: '0 0 16px 0' }}>
                    Upload an audio file to identify the song
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="badge badge-gray">MP3</span>
                    <span className="badge badge-gray">WAV</span>
                    <span className="badge badge-gray">M4A</span>
                    <span className="badge badge-gray">Max 10MB</span>
                  </div>
                </div>
              </div>
            )}

            {/* URL Tab */}
            {activeTab === 'url' && (
              <div>
                <h2 className="section-title">Extract Audio from URL</h2>
                <p className="text-body" style={{ marginBottom: '24px' }}>
                  Extract audio clips from YouTube videos - perfect for getting specific songs from compilations
                </p>
                
                {/* Main URL Input */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="input"
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={handleUrlExtraction}
                    disabled={!url.trim() || isLoading}
                    className="btn btn-primary"
                  >
                    {isLoading ? (
                      <>
                        <div className="loading-spinner"></div>
                        Extracting
                      </>
                    ) : (
                      'Extract Audio'
                    )}
                  </button>
                </div>

                {/* Time Range Options */}
                <div className="card" style={{ padding: '16px', marginBottom: '16px', background: '#f8fafc' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Time Range (Optional)
                  </h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Start Time Input */}
                    <div>
                      <label style={{ fontSize: '13px', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '4px' }}>
                        Start at:
                      </label>
                      <input
                        type="text"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        placeholder="2:15 (MM:SS)"
                        className="input"
                        style={{ fontSize: '14px', padding: '8px 12px' }}
                      />
                    </div>
                    
                    {/* End Time Input */}
                    <div>
                      <label style={{ fontSize: '13px', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '4px' }}>
                        End at:
                      </label>
                      <input
                        type="text"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        placeholder="2:45 (MM:SS)"
                        className="input"
                        style={{ fontSize: '14px', padding: '8px 12px' }}
                      />
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '12px', padding: '8px', background: '#dcfce7', borderRadius: '6px' }}>
                    <p style={{ margin: 0, fontSize: '12px', color: '#166534' }}>
                      💡 <strong>Examples:</strong> Leave blank for full song, or specify "2:15" to "2:45" to extract just the chorus. 
                      Perfect for Beatles Greatest Hits compilations!
                    </p>
                  </div>
                </div>
                
                {/* Platform Badges */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="badge badge-blue">YouTube</span>
                  <span className="badge badge-green">Audio Extraction</span>
                  <span className="badge badge-green">Time Range Support</span>
                </div>
              </div>
            )}

            {/* Recording Tab */}
            {activeTab === 'record' && (
              <div>
                <h2 className="section-title">Record Live Audio</h2>
                <p className="text-body" style={{ marginBottom: '32px', textAlign: 'center' }}>
                  Record audio from your microphone to identify the song
                </p>
                
                <div className="center" style={{ flexDirection: 'column', gap: '24px' }}>
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isLoading}
                    className={`btn btn-record ${isRecording ? 'recording' : ''}`}
                  >
                    {isRecording ? '⏹' : '🎤'}
                  </button>
                  
                  {isRecording && (
                    <div className="center" style={{ gap: '12px' }}>
                      <div className="audio-bars">
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                      <span style={{ fontSize: '14px', color: '#64748b' }}>Recording...</span>
                    </div>
                  )}
                  
                  <p className="text-small" style={{ textAlign: 'center', margin: 0 }}>
                    {isRecording ? 'Recording for up to 15 seconds' : 'Click to start recording'}
                  </p>
                </div>
              </div>
            )}

            {/* Loading State */}
            {isLoading && !isRecording && (
              <div style={{ padding: '32px 0', textAlign: 'center', borderTop: '1px solid #e2e8f0', marginTop: '32px' }}>
                <div className="center" style={{ gap: '12px', marginBottom: '8px' }}>
                  <div className="loading-spinner"></div>
                  <span style={{ fontSize: '16px', fontWeight: '500', color: '#374151' }}>
                    Analyzing audio
                  </span>
                </div>
                <p className="text-small" style={{ margin: 0 }}>
                  This may take a few moments
                </p>
              </div>
            )}

          </div>

          {/* Error Display */}
          {error && (
            <div className="result-error">
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600' }}>
                Recognition Failed
              </h3>
              <p style={{ margin: 0, fontSize: '14px' }}>{error}</p>
            </div>
          )}

          {/* Extraction Results Display */}
          {extractionResult && (
            <div>
              <div className="result-success">
                <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '600' }}>
                  Audio Extracted Successfully
                </h3>
                
                <div style={{ textAlign: 'left' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Video Title
                    </p>
                    <p style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                      {extractionResult.title}
                    </p>
                  </div>
                  
                  <div className="grid-2">
                    <div>
                      <p style={{ margin: '0 0 4px 0', fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Video Duration
                      </p>
                      <p style={{ margin: 0, fontSize: '16px', fontWeight: '500' }}>
                        {Math.floor(extractionResult.duration / 60)}:{(extractionResult.duration % 60).toString().padStart(2, '0')}
                      </p>
                    </div>
                    
                    <div>
                      <p style={{ margin: '0 0 4px 0', fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Extracted Clip
                      </p>
                      <p style={{ margin: 0, fontSize: '16px', fontWeight: '500' }}>
                        {extractionResult.extracted_segment ? 
                          `${Math.floor(extractionResult.extracted_segment.start_time / 60)}:${(extractionResult.extracted_segment.start_time % 60).toString().padStart(2, '0')} - ${extractionResult.extracted_segment.duration}s` 
                          : 'Full audio'
                        }
                      </p>
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Status
                    </p>
                    <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
                      {extractionResult.message}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recognition Results Display */}
          {result && (
            <div>
              {result.status === 'success' ? (
                <div className="result-success">
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '600' }}>
                    Song Identified
                  </h3>
                  
                  <div className="grid-2">
                    <div>
                      <div style={{ marginBottom: '12px' }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Title
                        </p>
                        <p style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                          {result.title || 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: '0 0 4px 0', fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Artist
                        </p>
                        <p style={{ margin: 0, fontSize: '16px', fontWeight: '500' }}>
                          {result.artist || 'Unknown'}
                        </p>
                      </div>
                    </div>
                    
                    <div>
                      <div style={{ marginBottom: '12px' }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Album
                        </p>
                        <p style={{ margin: 0, fontSize: '16px', fontWeight: '500' }}>
                          {result.album || 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: '0 0 8px 0', fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Confidence
                        </p>
                        <div className="progress-container" style={{ marginBottom: '4px' }}>
                          <div 
                            className="progress-bar"
                            style={{ width: `${(result.confidence || 0.85) * 100}%` }}
                          ></div>
                        </div>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: '500' }}>
                          {Math.round((result.confidence || 0.85) * 100)}%
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {result.release_date && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Release Date
                      </p>
                      <p style={{ margin: 0, fontSize: '16px', fontWeight: '500' }}>
                        {result.release_date}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="result-warning">
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600' }}>
                    No Match Found
                  </h3>
                  <p style={{ margin: 0, fontSize: '14px' }}>
                    {result.message || 'Unable to identify this audio. Try a different file or recording.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: 'center', paddingBottom: '32px' }}>
            <p className="text-small">
              Files are automatically deleted after processing for privacy
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default MusicRecognition;
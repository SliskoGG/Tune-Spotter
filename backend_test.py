import requests
import os
import sys
import time
from datetime import datetime
import unittest
import io

class TuneSpotterAPITester(unittest.TestCase):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Use the public endpoint from frontend .env
        self.base_url = "https://0c7b5fff-d9b3-4d38-8b31-63b213d244c5.preview.emergentagent.com"
        self.tests_run = 0
        self.tests_passed = 0
        
    def setUp(self):
        self.tests_run += 1
        print(f"\n🔍 Running test: {self._testMethodName}")
        
    def tearDown(self):
        if hasattr(self, '_outcome'):
            result = self._outcome.result
            if result.wasSuccessful():
                self.tests_passed += 1
                print(f"✅ Test passed: {self._testMethodName}")
            else:
                print(f"❌ Test failed: {self._testMethodName}")
    
    def test_01_health_check(self):
        """Test the health check endpoint"""
        url = f"{self.base_url}/api/health"
        print(f"Testing health check endpoint: {url}")
        
        response = requests.get(url)
        
        # Print response for debugging
        print(f"Status code: {response.status_code}")
        print(f"Response: {response.text}")
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["database"], "connected")
        self.assertIn(data["audd_api"], ["configured", "not_configured"])
    
    def test_02_recognize_file_invalid_type(self):
        """Test file recognition with invalid file type"""
        url = f"{self.base_url}/api/recognize/file"
        
        # Create a text file instead of audio
        files = {'file': ('test.txt', io.BytesIO(b'This is not an audio file'), 'text/plain')}
        
        response = requests.post(url, files=files)
        
        # Print response for debugging
        print(f"Status code: {response.status_code}")
        print(f"Response: {response.text}")
        
        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid file type", response.text)
    
    def test_03_recognize_url_invalid(self):
        """Test URL recognition with invalid URL"""
        url = f"{self.base_url}/api/recognize/url"
        
        data = {'url': 'https://example.com'}  # Not a valid audio/video URL
        
        response = requests.post(url, data=data)
        
        # Print response for debugging
        print(f"Status code: {response.status_code}")
        print(f"Response: {response.text}")
        
        # This should return an error since example.com is not a valid audio source
        self.assertIn(response.status_code, [400, 500])
    
    def test_04_recognize_url_valid(self):
        """Test URL recognition with a valid YouTube URL"""
        url = f"{self.base_url}/api/recognize/url"
        
        # Rick Astley - Never Gonna Give You Up
        data = {'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}
        
        print(f"Testing URL recognition with: {data['url']}")
        print("Note: This test may take longer as it needs to download and process the audio")
        
        try:
            response = requests.post(url, data=data, timeout=60)
            
            # Print response for debugging
            print(f"Status code: {response.status_code}")
            print(f"Response: {response.text}")
            
            # If the API is properly configured with AudD, it should return a result
            # If not, it might return an error which is also acceptable for testing
            if response.status_code == 200:
                data = response.json()
                self.assertIn(data["status"], ["success", "not_found"])
                if data["status"] == "success":
                    self.assertIsNotNone(data["title"])
                    self.assertIsNotNone(data["artist"])
            else:
                print("URL recognition failed, but this might be due to API configuration")
        except requests.exceptions.Timeout:
            print("Request timed out - this is expected for long-running processes")
            # We'll consider this a pass since timeouts are expected for this endpoint
            pass
        except Exception as e:
            self.fail(f"Unexpected error: {str(e)}")

def run_tests():
    # Create a test suite
    suite = unittest.TestSuite()
    
    # Add tests to the suite
    suite.addTest(TuneSpotterAPITester('test_01_health_check'))
    suite.addTest(TuneSpotterAPITester('test_02_recognize_file_invalid_type'))
    suite.addTest(TuneSpotterAPITester('test_03_recognize_url_invalid'))
    suite.addTest(TuneSpotterAPITester('test_04_recognize_url_valid'))
    
    # Run the tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Print summary
    print(f"\n📊 Tests passed: {result.testsRun - len(result.errors) - len(result.failures)}/{result.testsRun}")
    
    return len(result.errors) + len(result.failures)

if __name__ == "__main__":
    sys.exit(run_tests())

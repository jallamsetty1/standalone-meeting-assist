import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader } from 'lucide-react';
import { pipeline, env } from '@xenova/transformers';


function App() {
    const [isRecording, setIsRecording] = useState(false);
    const [transcription, setTranscription] = useState('');
    const [analysis, setAnalysis] = useState({
        contextualAnalysis: '',
        companies: [],
        products: [],
        relatedInfo: ''
    });
    const [status, setStatus] = useState('');
    const [isModelLoading, setIsModelLoading] = useState(true);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const recorderRef = useRef(null);
    const transcriberRef = useRef(null);
    const [stream, setStream] = useState(null);
    const chunksRef = useRef([]);

    useEffect(() => {
        const initTranscriber = async () => {
            try {
                env.allowLocalModels = false;
                env.useBrowserCache = false;
                setStatus('Loading Whisper model...');
                transcriberRef.current = await pipeline(
                    'automatic-speech-recognition',
                    'Xenova/whisper-base'
                );
                setIsModelLoading(false);
                setStatus('Model ready');
                console.log('Whisper model loaded');
            } catch (e) {
                setStatus(`Error loading model: ${e.message}`);
                console.error('Error loading model:', e);
            }
        };

        initTranscriber();
        setIsRecording(false);
    }, []);

    const analyzeWithOpenAI = async (text) => {
        if (!apiKey) {
            throw new Error('Please enter your OpenAI API key');
        }

        try {
            setIsAnalyzing(true);
            console.log('Analyzing text:', text);
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                model: 'gpt-4-turbo-preview',
                messages: [
                    {
                    role: 'system',
                    content: `You are an AI assistant specialized in analyzing transcribed speech with a focus on business intelligence. Your task is to:
                        1. Identify and provide relevant information about any companies mentioned
                        2. Identify and analyze any products or services discussed
                        3. Provide additional context and market insights about the identified companies/products
                        4. Highlight any relevant industry trends or competitive dynamics mentioned
                        5. Structure your response in JSON format with the following keys as an array of strings:
                        - contextualAnalysis: A brief overview of the main discussion points
                        - companies: Array of identified companies with name and industry
                        - products: Array of identified products with name and descriptions
                        - relatedInfo: Additional market insights or trends
                        Keep your analysis factual and business-focused while maintaining a natural, conversational tone.`
                    },
                    {
                    role: 'user',
                    content: `Please analyze this transcribed text: "${text}"`
                    }
                ],
                response_format: { type: "json_object" },
                max_tokens: 500,
                temperature: 0.7,
                }),
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status}`);
            }

            const data = await response.json();
            let result;

            try {
                result = JSON.parse(data.choices[0].message.content);
            } catch (error) {
                console.error('Invalid JSON:', error.message);
                throw error;
            }

            return result;
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw error;
        } finally {
            setIsAnalyzing(false);
        }
    };

    const startRecording = async () => {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorderRef.current = new MediaRecorder(mediaStream, { mimeType: 'audio/webm;codecs=opus' });

        console.log('Recording started:', mediaStream.getAudioTracks()[0].label);
        setStream(mediaStream);
        chunksRef.current = [];

        // Store recorded chunks
        recorderRef.current.ondataavailable = event => {
            if (event.data.size > 0) {
                chunksRef.current.push(event.data);
            }
        };

        // When recording stops, create the .wav file
        recorderRef.current.onstop = async () => {
            setStatus('Transcribing audio...');

            recorderRef.current.stream.getTracks().forEach(track => track.stop());
            console.log('Recording stopped:', chunksRef.current.length);
            const webmBlob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
            const fileReader = new FileReader();

            fileReader.onloadend = async () => {
                const audioCTX = new AudioContext({ sampleRate: 16000 });
                const arrayBuffer = fileReader.result;
                const decoded = await audioCTX.decodeAudioData(arrayBuffer);

                let audio;
                if (decoded.numberOfChannels === 2) {
                    const SCALING_FACTOR = Math.sqrt(2);

                    let left = decoded.getChannelData(0);
                    let right = decoded.getChannelData(1);

                    audio = new Float32Array(left.length);
                    for (let i = 0; i < decoded.length; ++i) {
                        audio[i] = SCALING_FACTOR * (left[i] + right[i]) / 2;
                    }
                } else {
                    // If the audio is not stereo, we can just use the first channel:
                    audio = decoded.getChannelData(0);
                }

                if (!transcriberRef.current) {
                    throw new Error('Transcriber not initialized');
                }

                let result;
                try {
                    result = await transcriberRef.current(audio, {
                        chunk_length_s: 30,
                        stride_length_s: 5,
                        language: 'english',
                        return_timestamps: false
                    });
                } catch (e) {
                    setStatus(`Transcription error: ${e.message}`); 
                }

                // Reset chunks.
                chunksRef.current = [];
                setTranscription(result.text);
                console.log('Transcription:', result.text);
                setStatus('Transcription analysis in progress...');

                const analysisResult = await analyzeWithOpenAI(result.text);
                setAnalysis(analysisResult);
                setStatus('Transcription analysis done!');
            };
            fileReader.readAsArrayBuffer(webmBlob);
        };

        // Start recording
        recorderRef.current.start();
        console.log('Recording started...');

        setIsRecording(true);
        setStatus('Recording...');
    };

    const stopRecording = async () => {
        if (recorderRef.current && isRecording) {
            recorderRef.current.requestData();
            recorderRef.current.stop();
            setIsRecording(false);
            setStatus('');
            console.log('Recording stopped');
            stream.getTracks().forEach(track => track.stop());
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 py-8">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-6">
            <h1 className="text-2xl font-bold text-center mb-8">Browser based transcription and text analysis demo</h1>

            <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
                OpenAI API Key
            </label>
            <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your OpenAI API key"
            />
            </div>

            <div className="space-y-6">
            <div className="flex justify-center space-x-4">
                <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isModelLoading || isAnalyzing || !apiKey}
                className={`px-6 py-2 rounded-md flex items-center ${
                    isRecording 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                {isModelLoading ? (
                    <><Loader className="mr-2 h-4 w-4 animate-spin" /> Loading</>
                ) : isRecording ? (
                    <><Square className="mr-2 h-4 w-4" /> Stop</>
                ) : (
                    <><Mic className="mr-2 h-4 w-4" /> Record</>
                )}
                </button>
            </div>

            {status && (
                <div className="text-center text-sm text-gray-500">
                {status}
                </div>
            )}

            {transcription && (
                <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-2">Transcription:</h3>
                <p className="text-gray-700">{transcription}</p>
                </div>
            )}

            {isAnalyzing && (
                <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-blue-700">Analyzing business context...</p>
                </div>
            )}

            {analysis.contextualAnalysis && (
                <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                    <h3 className="font-medium mb-2">Overview:</h3>
                    <p className="text-gray-700">{analysis.contextualAnalysis[0]}</p>
                </div>

                {analysis.companies.length > 0 && (
                    <div className="p-4 bg-green-50 rounded-lg">
                    <h3 className="font-medium mb-2">Companies Mentioned:</h3>
                    <ul className="list-disc pl-4 space-y-2">
                    {analysis.companies.map((company, index) => (
                    <li key={index} className="text-gray-700">
                        <strong>{company.name}</strong> - {company.industry}
                    </li>
                    ))}
                    </ul>
                    </div>
                )}

                {analysis.products.length > 0 && (
                    <div className="p-4 bg-purple-50 rounded-lg">
                    <h3 className="font-medium mb-2">Products & Services:</h3>
                    <ul className="list-disc pl-4 space-y-2">
                        {analysis.products.map((product, index) => (
                        <li key={index} className="text-gray-700">
                            <strong>{product.name}</strong> - {product.descriptions}
                        </li>
                        ))}
                    </ul>
                    </div>
                )}

                {analysis.relatedInfo && (
                    <div className="p-4 bg-yellow-50 rounded-lg">
                    <h3 className="font-medium mb-2">Additional Insights:</h3>
                    <p className="text-gray-700">{analysis.relatedInfo[0]}</p>
                    </div>
                )}
                </div>
            )}
            </div>
        </div>
        </div>
    );
}

export default App;
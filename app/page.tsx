'use client';

import { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';

interface BarcodeSettings {
  format: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  text?: string;
  font?: string;
  fontSize?: number;
  backgroundColor?: string;
  lineColor?: string;
}

interface ExportSettings {
  format: 'png' | 'svg' | 'jpg';
  resolution: number;
  prefix: string;
  suffix: string;
}

const BARCODE_FORMATS = [
  { value: 'CODE128', label: 'Code 128', validation: () => true },
  { value: 'CODE39', label: 'Code 39', validation: (text: string) => /^[0-9A-Z\-. $\/+%]+$/.test(text) },
  { value: 'EAN13', label: 'EAN-13', validation: (text: string) => /^\d{13}$/.test(text) },
  { value: 'EAN8', label: 'EAN-8', validation: (text: string) => /^\d{8}$/.test(text) },
  { value: 'UPC', label: 'UPC-A', validation: (text: string) => /^\d{12}$/.test(text) },
];

export default function BarcodeGenerator() {
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [inputText, setInputText] = useState('');
  const [barcodeSettings, setBarcodeSettings] = useState<BarcodeSettings>({
    format: 'CODE128',
    width: 2,
    height: 100,
    displayValue: true,
    font: 'monospace',
    fontSize: 20,
    backgroundColor: '#ffffff',
    lineColor: '#000000'
  });
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 'png',
    resolution: 500,
    prefix: '',
    suffix: ''
  });
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchData, setBatchData] = useState<Array<{barcode: string, text?: string}>>([]);
  const [validationError, setValidationError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<SVGSVGElement>(null);

  // Validate barcode format
  const validateBarcode = (text: string, format: string): boolean => {
    if (!text) return false;
    const formatInfo = BARCODE_FORMATS.find(f => f.value === format);
    if (!formatInfo) return false;
    return formatInfo.validation(text);
  };

  // Generate preview barcode
  useEffect(() => {
    if (!inputText || !previewRef.current) {
      setValidationError('');
      return;
    }
    
    const isValid = validateBarcode(inputText, barcodeSettings.format);
    if (!isValid) {
      setValidationError(`Invalid format for ${barcodeSettings.format}`);
      return;
    }
    
    setValidationError('');
    
    try {
      JsBarcode(previewRef.current, inputText, {
        format: barcodeSettings.format,
        width: barcodeSettings.width,
        height: barcodeSettings.height,
        displayValue: barcodeSettings.displayValue,
        text: barcodeSettings.text || inputText,
        font: barcodeSettings.font,
        fontSize: barcodeSettings.fontSize,
        background: barcodeSettings.backgroundColor,
        lineColor: barcodeSettings.lineColor,
      });
    } catch (error) {
      setValidationError('Error generating barcode');
    }
  }, [inputText, barcodeSettings]);

  // Handle single barcode download
  const downloadSingle = () => {
    if (!inputText || validationError) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size based on resolution
    const ratio = exportSettings.resolution / 500;
    canvas.width = 400 * ratio;
    canvas.height = 200 * ratio;
    
    // Generate barcode on canvas
    JsBarcode(canvas, inputText, {
      format: barcodeSettings.format,
      width: barcodeSettings.width! * ratio,
      height: barcodeSettings.height! * ratio,
      displayValue: barcodeSettings.displayValue,
      text: barcodeSettings.text || inputText,
      font: barcodeSettings.font,
      fontSize: barcodeSettings.fontSize! * ratio,
      background: barcodeSettings.backgroundColor,
      lineColor: barcodeSettings.lineColor,
    });
    
    // Download based on format
    if (exportSettings.format === 'svg') {
      const svgElement = previewRef.current;
      if (svgElement) {
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const filename = `${exportSettings.prefix}${inputText}${exportSettings.suffix}.svg`;
        saveAs(blob, filename);
      }
    } else {
      canvas.toBlob((blob) => {
        if (blob) {
          const filename = `${exportSettings.prefix}${inputText}${exportSettings.suffix}.${exportSettings.format}`;
          saveAs(blob, filename);
        }
      }, `image/${exportSettings.format}`, 0.9);
    }
  };

  // Handle batch file upload
  const handleBatchUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setBatchFile(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      
      if (file.name.endsWith('.csv')) {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const data = results.data.map((row: any) => ({
              barcode: row.barcode || row.Barcode || Object.values(row)[0],
              text: row.text || row.Text || row.barcode || row.Barcode || Object.values(row)[0]
            }));
            setBatchData(data);
          }
        });
      } else {
        // TXT file - one barcode per line
        const lines = text.split('\n').filter(line => line.trim());
        const data = lines.map(line => ({
          barcode: line.trim(),
          text: line.trim()
        }));
        setBatchData(data);
      }
    };
    
    reader.readAsText(file);
  };

  // Generate batch barcodes
  const generateBatch = async () => {
    if (!batchData.length) return;
    
    setIsGenerating(true);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const ratio = exportSettings.resolution / 500;
    canvas.width = 400 * ratio;
    canvas.height = 200 * ratio;
    
    for (let i = 0; i < batchData.length; i++) {
      const item = batchData[i];
      
      if (!validateBarcode(item.barcode, barcodeSettings.format)) {
        console.warn(`Invalid barcode: ${item.barcode}`);
        continue;
      }
      
      try {
        if (exportSettings.format === 'svg') {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          JsBarcode(svg, item.barcode, {
            format: barcodeSettings.format,
            width: barcodeSettings.width,
            height: barcodeSettings.height,
            displayValue: barcodeSettings.displayValue,
            text: item.text,
            font: barcodeSettings.font,
            fontSize: barcodeSettings.fontSize,
            background: barcodeSettings.backgroundColor,
            lineColor: barcodeSettings.lineColor,
          });
          
          const svgData = new XMLSerializer().serializeToString(svg);
          const blob = new Blob([svgData], { type: 'image/svg+xml' });
          const filename = `${exportSettings.prefix}${item.barcode}${exportSettings.suffix}.svg`;
          saveAs(blob, filename);
        } else {
          JsBarcode(canvas, item.barcode, {
            format: barcodeSettings.format,
            width: barcodeSettings.width! * ratio,
            height: barcodeSettings.height! * ratio,
            displayValue: barcodeSettings.displayValue,
            text: item.text,
            font: barcodeSettings.font,
            fontSize: barcodeSettings.fontSize! * ratio,
            background: barcodeSettings.backgroundColor,
            lineColor: barcodeSettings.lineColor,
          });
          
          canvas.toBlob((blob) => {
            if (blob) {
              const filename = `${exportSettings.prefix}${item.barcode}${exportSettings.suffix}.${exportSettings.format}`;
              saveAs(blob, filename);
            }
          }, `image/${exportSettings.format}`, 0.9);
        }
        
        // Small delay to prevent browser freezing
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.error(`Error generating barcode for ${item.barcode}:`, error);
      }
    }
    
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            🏷️ Barcode Generator
          </h1>
          <p className="text-center text-gray-600 mt-2">Create professional barcodes with ease</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-xl p-1 shadow-md border">
            <button
              onClick={() => setActiveTab('single')}
              className={`px-8 py-3 rounded-lg font-medium transition-all duration-200 ${
                activeTab === 'single'
                  ? 'bg-blue-500 text-white shadow-md transform scale-105'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              ✨ Single Generation
            </button>
            <button
              onClick={() => setActiveTab('batch')}
              className={`px-8 py-3 rounded-lg font-medium transition-all duration-200 ${
                activeTab === 'batch'
                  ? 'bg-blue-500 text-white shadow-md transform scale-105'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              📦 Batch Generation
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Settings Sidebar */}
          <div className="xl:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-6 border">
              <h2 className="text-xl font-bold mb-6 text-gray-800 flex items-center">
                ⚙️ Settings
              </h2>
              
              {/* Barcode Format */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold mb-3 text-gray-700">Barcode Format</label>
                  <select
                    value={barcodeSettings.format}
                    onChange={(e) => setBarcodeSettings({...barcodeSettings, format: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  >
                    {BARCODE_FORMATS.map(format => (
                      <option key={format.value} value={format.value}>
                        {format.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Display Options */}
                <div>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={barcodeSettings.displayValue}
                      onChange={(e) => setBarcodeSettings({...barcodeSettings, displayValue: e.target.checked})}
                      className="w-5 h-5 text-blue-600 border-2 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Show text below barcode</span>
                  </label>
                </div>

                {/* Size Controls */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-700">Width</label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="0.5"
                      value={barcodeSettings.width}
                      onChange={(e) => setBarcodeSettings({...barcodeSettings, width: Number(e.target.value)})}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-xs text-gray-500">{barcodeSettings.width}x</span>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-700">Height</label>
                    <input
                      type="range"
                      min="50"
                      max="200"
                      step="10"
                      value={barcodeSettings.height}
                      onChange={(e) => setBarcodeSettings({...barcodeSettings, height: Number(e.target.value)})}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-xs text-gray-500">{barcodeSettings.height}px</span>
                  </div>
                </div>

                {/* Colors */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-700">Background</label>
                    <div className="relative">
                      <input
                        type="color"
                        value={barcodeSettings.backgroundColor}
                        onChange={(e) => setBarcodeSettings({...barcodeSettings, backgroundColor: e.target.value})}
                        className="w-full h-12 border-2 border-gray-300 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-700">Barcode Color</label>
                    <div className="relative">
                      <input
                        type="color"
                        value={barcodeSettings.lineColor}
                        onChange={(e) => setBarcodeSettings({...barcodeSettings, lineColor: e.target.value})}
                        className="w-full h-12 border-2 border-gray-300 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Export Settings */}
                <div className="border-t pt-6 mt-6">
                  <h3 className="font-bold mb-4 text-gray-800 flex items-center">
                    📥 Export Settings
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700">Format</label>
                      <select
                        value={exportSettings.format}
                        onChange={(e) => setExportSettings({...exportSettings, format: e.target.value as any})}
                        className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      >
                        <option value="png">PNG (Recommended)</option>
                        <option value="jpg">JPG</option>
                        <option value="svg">SVG (Vector)</option>
                      </select>
                    </div>

                    {exportSettings.format !== 'svg' && (
                      <div>
                        <label className="block text-sm font-semibold mb-2 text-gray-700">Resolution</label>
                        <select
                          value={exportSettings.resolution}
                          onChange={(e) => setExportSettings({...exportSettings, resolution: Number(e.target.value)})}
                          className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        >
                          <option value="300">300px (Small)</option>
                          <option value="500">500px (Medium)</option>
                          <option value="800">800px (Large)</option>
                          <option value="1200">1200px (XL)</option>
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-semibold mb-2 text-gray-700">Prefix</label>
                        <input
                          type="text"
                          value={exportSettings.prefix}
                          onChange={(e) => setExportSettings({...exportSettings, prefix: e.target.value})}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          placeholder="prefix_"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-2 text-gray-700">Suffix</label>
                        <input
                          type="text"
                          value={exportSettings.suffix}
                          onChange={(e) => setExportSettings({...exportSettings, suffix: e.target.value})}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          placeholder="_suffix"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="xl:col-span-3">
            {activeTab === 'single' ? (
              // Single Generation
              <div className="bg-white rounded-2xl shadow-lg p-8 border">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center">
                  ✨ Single Barcode Generation
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold mb-3 text-gray-700">Barcode Content</label>
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="w-full p-4 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
                      rows={3}
                      placeholder="Enter text to generate barcode..."
                    />
                    {validationError && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-600 text-sm font-medium">⚠️ {validationError}</p>
                      </div>
                    )}
                  </div>

                  {/* Preview */}
                  <div>
                    <h3 className="font-semibold mb-4 text-gray-800 flex items-center">
                      👁️ Preview
                    </h3>
                    <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center min-h-[200px] flex items-center justify-center">
                      {inputText && !validationError ? (
                        <div className="p-4 bg-white rounded-lg shadow-sm">
                          <svg ref={previewRef}></svg>
                        </div>
                      ) : (
                        <div className="text-gray-500">
                          <div className="text-4xl mb-2">📊</div>
                          <p className="font-medium">Enter valid text to see preview</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={downloadSingle}
                    disabled={!inputText || !!validationError}
                    className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                  >
                    {inputText && !validationError ? '⬇️ Download Barcode' : '📝 Enter valid text first'}
                  </button>
                </div>
              </div>
            ) : (
              // Batch Generation
              <div className="bg-white rounded-2xl shadow-lg p-8 border">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center">
                  📦 Batch Generation
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold mb-3 text-gray-700">Upload File</label>
                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
                      <input
                        type="file"
                        accept=".txt,.csv"
                        onChange={handleBatchUpload}
                        className="hidden"
                        id="file-upload"
                      />
                      <label htmlFor="file-upload" className="cursor-pointer">
                        <div className="text-4xl mb-4">📁</div>
                        <p className="text-lg font-medium text-gray-700 mb-2">
                          Drop your file here or click to browse
                        </p>
                        <p className="text-sm text-gray-500">
                          Supports TXT (one barcode per line) and CSV (columns: barcode, text)
                        </p>
                      </label>
                    </div>
                  </div>

                  {batchData.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-4 text-gray-800 flex items-center">
                        👀 Preview ({batchData.length} items)
                      </h3>
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-60 overflow-y-auto">
                        <div className="space-y-2">
                          {batchData.slice(0, 10).map((item, index) => (
                            <div key={index} className="flex items-center justify-between bg-white p-3 rounded-lg">
                              <div>
                                <span className="font-mono font-medium text-gray-900">{item.barcode}</span>
                                {item.text !== item.barcode && (
                                  <span className="text-gray-500 ml-2">→ {item.text}</span>
                                )}
                              </div>
                              <span className="text-xs text-gray-400">#{index + 1}</span>
                            </div>
                          ))}
                          {batchData.length > 10 && (
                            <div className="text-center text-gray-500 py-2">
                              ... and {batchData.length - 10} more items
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={generateBatch}
                    disabled={!batchData.length || isGenerating}
                    className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:from-green-600 hover:to-green-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                  >
                    {isGenerating ? (
                      <span className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Generating...
                      </span>
                    ) : batchData.length > 0 ? (
                      `🚀 Generate ${batchData.length} Barcodes`
                    ) : (
                      '📁 Upload file first'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Hidden canvas for exports */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
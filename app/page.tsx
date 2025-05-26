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
    const formatInfo = BARCODE_FORMATS.find(f => f.value === format);
    if (!formatInfo) return false;
    return formatInfo.validation(text);
  };

  // Generate preview barcode
  useEffect(() => {
    if (!inputText || !previewRef.current) return;
    
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
      ...barcodeSettings,
      width: barcodeSettings.width! * ratio,
      height: barcodeSettings.height! * ratio,
      fontSize: barcodeSettings.fontSize! * ratio,
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          Barcode Generator
        </h1>
        
        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setActiveTab('single')}
              className={`px-6 py-2 rounded-md transition-colors ${
                activeTab === 'single'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Single Generation
            </button>
            <button
              onClick={() => setActiveTab('batch')}
              className={`px-6 py-2 rounded-md transition-colors ${
                activeTab === 'batch'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Batch Generation
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Settings Panel */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Settings</h2>
            
            {/* Barcode Format */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Format</label>
              <select
                value={barcodeSettings.format}
                onChange={(e) => setBarcodeSettings({...barcodeSettings, format: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                {BARCODE_FORMATS.map(format => (
                  <option key={format.value} value={format.value}>
                    {format.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Display Options */}
            <div className="mb-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={barcodeSettings.displayValue}
                  onChange={(e) => setBarcodeSettings({...barcodeSettings, displayValue: e.target.checked})}
                  className="mr-2"
                />
                Show text below barcode
              </label>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">Background</label>
                <input
                  type="color"
                  value={barcodeSettings.backgroundColor}
                  onChange={(e) => setBarcodeSettings({...barcodeSettings, backgroundColor: e.target.value})}
                  className="w-full h-10 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Barcode Color</label>
                <input
                  type="color"
                  value={barcodeSettings.lineColor}
                  onChange={(e) => setBarcodeSettings({...barcodeSettings, lineColor: e.target.value})}
                  className="w-full h-10 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            {/* Export Settings */}
            <div className="border-t pt-4 mt-4">
              <h3 className="font-medium mb-3">Export Settings</h3>
              
              <div className="mb-3">
                <label className="block text-sm font-medium mb-2">Format</label>
                <select
                  value={exportSettings.format}
                  onChange={(e) => setExportSettings({...exportSettings, format: e.target.value as any})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="svg">SVG</option>
                </select>
              </div>

              {exportSettings.format !== 'svg' && (
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-2">Resolution (px)</label>
                  <input
                    type="number"
                    value={exportSettings.resolution}
                    onChange={(e) => setExportSettings({...exportSettings, resolution: Number(e.target.value)})}
                    min="100"
                    max="2000"
                    step="50"
                    className="w-full p-2 border border-gray-300 rounded-md"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium mb-2">Prefix</label>
                  <input
                    type="text"
                    value={exportSettings.prefix}
                    onChange={(e) => setExportSettings({...exportSettings, prefix: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md"
                    placeholder="prefix_"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Suffix</label>
                  <input
                    type="text"
                    value={exportSettings.suffix}
                    onChange={(e) => setExportSettings({...exportSettings, suffix: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md"
                    placeholder="_suffix"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            {activeTab === 'single' ? (
              // Single Generation
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold mb-4">Single Barcode Generation</h2>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Barcode Content</label>
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md"
                    rows={3}
                    placeholder="Enter text to generate barcode..."
                  />
                  {validationError && (
                    <p className="text-red-500 text-sm mt-1">{validationError}</p>
                  )}
                </div>

                {/* Preview */}
                <div className="mb-6">
                  <h3 className="font-medium mb-3">Preview</h3>
                  <div className="bg-gray-50 p-6 rounded-md text-center min-h-[150px] flex items-center justify-center">
                    {inputText && !validationError ? (
                      <svg ref={previewRef}></svg>
                    ) : (
                      <p className="text-gray-500">Enter valid text to see preview</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={downloadSingle}
                  disabled={!inputText || !!validationError}
                  className="w-full bg-blue-500 text-white py-3 px-6 rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Download Barcode
                </button>
              </div>
            ) : (
              // Batch Generation
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold mb-4">Batch Generation</h2>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Upload File (TXT or CSV)</label>
                  <input
                    type="file"
                    accept=".txt,.csv"
                    onChange={handleBatchUpload}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    TXT: one barcode per line | CSV: columns "barcode" and optional "text"
                  </p>
                </div>

                {batchData.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-medium mb-3">Preview ({batchData.length} items)</h3>
                    <div className="bg-gray-50 p-4 rounded-md max-h-40 overflow-y-auto">
                      {batchData.slice(0, 5).map((item, index) => (
                        <div key={index} className="text-sm py-1">
                          <strong>{item.barcode}</strong>
                          {item.text !== item.barcode && <span className="text-gray-600"> → {item.text}</span>}
                        </div>
                      ))}
                      {batchData.length > 5 && (
                        <p className="text-gray-500 text-sm">... and {batchData.length - 5} more</p>
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={generateBatch}
                  disabled={!batchData.length || isGenerating}
                  className="w-full bg-green-500 text-white py-3 px-6 rounded-md hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isGenerating ? 'Generating...' : `Generate ${batchData.length} Barcodes`}
                </button>
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
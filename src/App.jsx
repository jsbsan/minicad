import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MousePointer2, 
  Pencil, 
  Square, 
  Circle, 
  Minus, 
  Hand, 
  Undo, 
  Redo, 
  Trash2, 
  Download,
  ZoomIn,
  ZoomOut,
  Magnet,
  Copy,
  Grid,
  Layers as LayersIcon,
  Eye,
  EyeOff,
  Plus,
  Image as ImageIcon,
  Activity,
  RotateCw,
  Upload,
  Ruler,
  CircleDot,
  Type,
  Hash,
  FileCode2,
  Crosshair,
  CopyPlus,
  Package,
  PackagePlus,
  Printer,
  Scissors,
  Maximize
} from 'lucide-react';

// --- UTILIDADES MATEMÁTICAS Y GEOMÉTRICAS ---

const GRID_SIZE = 50;

const distance = (a, b) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

const distanceToLine = (p, a, b) => {
  const l2 = Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2);
  if (l2 === 0) return distance(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
};

const translateElement = (el, dx, dy) => {
  let newEl = JSON.parse(JSON.stringify(el));
  if (newEl.x1 !== undefined) { newEl.x1 += dx; newEl.x2 += dx; newEl.y1 += dy; newEl.y2 += dy; }
  if (newEl.cx !== undefined) { newEl.cx += dx; newEl.cy += dy; newEl.textX += dx; newEl.textY += dy; }
  if (newEl.x !== undefined) { newEl.x += dx; newEl.y += dy; }
  if (newEl.points) { newEl.points.forEach(p => { p.x += dx; p.y += dy; }); }
  return newEl;
};

const getBoundingBox = (els) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  els.forEach(el => {
      const xs = [el.x, el.x1, el.x2, el.cx].filter(x => x !== undefined);
      const ys = [el.y, el.y1, el.y2, el.cy].filter(y => y !== undefined);
      if (el.points) el.points.forEach(p => { xs.push(p.x); ys.push(p.y); });
      if (el.r !== undefined) {
         const cx = el.x !== undefined ? el.x : el.cx;
         const cy = el.y !== undefined ? el.y : el.cy;
         xs.push(cx - el.r); xs.push(cx + el.r);
         ys.push(cy - el.r); ys.push(cy + el.r);
      }
      xs.forEach(x => { if (x < minX) minX = x; if (x > maxX) maxX = x; });
      ys.forEach(y => { if (y < minY) minY = y; if (y > maxY) maxY = y; });
  });
  return { minX, minY, maxX, maxY, cx: (minX + maxX)/2, cy: (minY + maxY)/2 };
};

// --- MOTOR DE OSNAP Y MATEMÁTICAS DE INTERSECCIÓN ---
const extractSegments = (el, blockDefs = null, transform = null) => {
  let segs = [];
  const applyT = (p) => {
      if (!transform) return p;
      let dx = p.x * transform.s, dy = p.y * transform.s;
      let rx = dx * Math.cos(transform.r) - dy * Math.sin(transform.r);
      let ry = dx * Math.sin(transform.r) + dy * Math.cos(transform.r);
      return { x: transform.x + rx, y: transform.y + ry };
  };

  if (el.type === 'line') segs.push([ applyT({x:el.x1, y:el.y1}), applyT({x:el.x2, y:el.y2}) ]);
  if (el.type === 'rect') {
     segs.push([ applyT({x:el.x1, y:el.y1}), applyT({x:el.x2, y:el.y1}) ]);
     segs.push([ applyT({x:el.x2, y:el.y1}), applyT({x:el.x2, y:el.y2}) ]);
     segs.push([ applyT({x:el.x2, y:el.y2}), applyT({x:el.x1, y:el.y2}) ]);
     segs.push([ applyT({x:el.x1, y:el.y2}), applyT({x:el.x1, y:el.y1}) ]);
  }
  if (el.type === 'polyline' || el.type === 'hatch' || el.type === 'pencil') {
     if(el.points) {
         for(let i=0; i<el.points.length-1; i++) {
           segs.push([applyT(el.points[i]), applyT(el.points[i+1])]);
         }
         if (el.type === 'hatch' && el.points.length > 2) {
           segs.push([applyT(el.points[el.points.length-1]), applyT(el.points[0])]);
         }
     }
  }
  if (el.type === 'block' && blockDefs) {
      const def = blockDefs[el.blockName];
      if (def) {
          const t = { x: el.x, y: el.y, s: el.scale || 1, r: (el.rotation || 0) * Math.PI / 180 };
          def.elements.forEach(innerEl => {
              segs.push(...extractSegments(innerEl, blockDefs, t));
          });
      }
  }
  return segs;
};

const getIntersection = (p1, p2, p3, p4) => {
  const denom = (p1.x - p2.x)*(p3.y - p4.y) - (p1.y - p2.y)*(p3.x - p4.x);
  if (denom === 0) return null;
  const t = ((p1.x - p3.x)*(p3.y - p4.y) - (p1.y - p3.y)*(p3.x - p4.x)) / denom;
  const u = -((p1.x - p2.x)*(p1.y - p3.y) - (p1.y - p2.y)*(p1.x - p3.x)) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: p1.x + t*(p2.x - p1.x), y: p1.y + t*(p2.y - p1.y) };
  }
  return null;
};

// Intersección de línea infinita con segmento finito (Para Recortar/Alargar)
const getLineInfiniteIntersection = (A, B, C, D) => {
  const denom = (A.x - B.x)*(C.y - D.y) - (A.y - B.y)*(C.x - D.x);
  if (denom === 0) return null;
  const t = ((A.x - C.x)*(C.y - D.y) - (A.y - C.y)*(C.x - D.x)) / denom;
  const u = -((A.x - B.x)*(A.y - C.y) - (A.y - B.y)*(A.x - C.x)) / denom;
  if (u >= 0 && u <= 1) {
    return { t, x: A.x + t*(B.x - A.x), y: A.y + t*(B.y - A.y) };
  }
  return null;
};

// Intersección de línea infinita con círculo
const getLineCircleIntersections = (A, B, C_center, R) => {
  const dX = B.x - A.x, dY = B.y - A.y;
  const fX = A.x - C_center.x, fY = A.y - C_center.y;
  const a = dX * dX + dY * dY;
  const b = 2 * (fX * dX + fY * dY);
  const c = (fX * fX + fY * fY) - R * R;
  let disc = b * b - 4 * a * c;
  if (disc < 0 || a === 0) return [];
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a), t2 = (-b + disc) / (2 * a);
  const pts = [];
  if (!isNaN(t1)) pts.push({ t: t1, x: A.x + t1 * dX, y: A.y + t1 * dY });
  if (!isNaN(t2) && t1 !== t2) pts.push({ t: t2, x: A.x + t2 * dX, y: A.y + t2 * dY });
  return pts;
};

const getPerpendicular = (p, p1, p2) => {
  const l2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
  if (l2 === 0) return null;
  let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2;
  if (t < 0 || t > 1) return null; 
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
};

const findOsnap = (worldPos, elements, threshold, activeStart, excludeId, layers, blockDefs) => {
   let candidates = [];
   let nearbySegments = [];

   elements.forEach(el => {
      if (el.id === excludeId) return;
      const elLayer = layers.find(l => l.id === (el.layerId || 'layer1'));
      if (elLayer && !elLayer.visible) return;

      if (el.type === 'line') {
         candidates.push({ x: el.x1, y: el.y1, type: 'endpoint' });
         candidates.push({ x: el.x2, y: el.y2, type: 'endpoint' });
         candidates.push({ x: (el.x1+el.x2)/2, y: (el.y1+el.y2)/2, type: 'midpoint' });
      } else if (el.type === 'circle') {
         candidates.push({ x: el.x1, y: el.y1, type: 'center' });
      } else if (el.type === 'arc') {
         candidates.push({ x: el.x, y: el.y, type: 'center' });
         candidates.push({ x: el.x + el.r*Math.cos(el.startAngle), y: el.y + el.r*Math.sin(el.startAngle), type: 'endpoint' });
         candidates.push({ x: el.x + el.r*Math.cos(el.endAngle), y: el.y + el.r*Math.sin(el.endAngle), type: 'endpoint' });
         
         let sa = el.startAngle, ea = el.endAngle;
         if (ea < sa) ea += 2*Math.PI;
         candidates.push({ x: el.x + el.r*Math.cos((sa + ea) / 2), y: el.y + el.r*Math.sin((sa + ea) / 2), type: 'midpoint' });
      } else if (el.type === 'rect') {
         candidates.push({ x: el.x1, y: el.y1, type: 'endpoint' });
         candidates.push({ x: el.x2, y: el.y1, type: 'endpoint' });
         candidates.push({ x: el.x1, y: el.y2, type: 'endpoint' });
         candidates.push({ x: el.x2, y: el.y2, type: 'endpoint' });
         candidates.push({ x: (el.x1+el.x2)/2, y: el.y1, type: 'midpoint' });
         candidates.push({ x: (el.x1+el.x2)/2, y: el.y2, type: 'midpoint' });
         candidates.push({ x: el.x1, y: (el.y1+el.y2)/2, type: 'midpoint' });
         candidates.push({ x: el.x2, y: (el.y1+el.y2)/2, type: 'midpoint' });
      } else if (el.type === 'polyline' || el.type === 'hatch' || el.type === 'pencil') {
         if (el.points) {
             el.points.forEach((p, i) => {
                 candidates.push({ x: p.x, y: p.y, type: 'endpoint' }); 
                 if (i < el.points.length - 1) {
                     candidates.push({ x: (p.x+el.points[i+1].x)/2, y: (p.y+el.points[i+1].y)/2, type: 'midpoint' });
                 }
             });
             if (el.type === 'hatch' && el.points.length > 2) {
                 const pFirst = el.points[0], pLast = el.points[el.points.length-1];
                 candidates.push({ x: (pFirst.x+pLast.x)/2, y: (pFirst.y+pLast.y)/2, type: 'midpoint' });
             }
         }
      } else if (el.type === 'block') {
         candidates.push({ x: el.x, y: el.y, type: 'center' }); // Base point
      }

      const segs = extractSegments(el, blockDefs);
      segs.forEach(s => {
         if (distanceToLine(worldPos, s[0], s[1]) < threshold * 3) {
             nearbySegments.push(s);
             if (activeStart) {
                 const perp = getPerpendicular(activeStart, s[0], s[1]);
                 if (perp) candidates.push({ x: perp.x, y: perp.y, type: 'perpendicular' });
             }
         }
      });
   });

   for(let i=0; i<nearbySegments.length; i++) {
      for(let j=i+1; j<nearbySegments.length; j++) {
         const intPt = getIntersection(nearbySegments[i][0], nearbySegments[i][1], nearbySegments[j][0], nearbySegments[j][1]);
         if (intPt) candidates.push({ x: intPt.x, y: intPt.y, type: 'intersection' });
      }
   }

   let closest = null;
   let minDist = threshold;
   const priority = { 'endpoint': 1, 'intersection': 2, 'midpoint': 3, 'center': 4, 'perpendicular': 5 };

   candidates.forEach(c => {
      const d = distance(worldPos, c);
      if (d < minDist) {
         minDist = d; closest = c;
      } else if (d === minDist && closest && priority[c.type] < priority[closest.type]) {
         closest = c;
      }
   });

   return closest;
};

// --- RESTO DE FUNCIONES ---
const isPointNearElement = (x, y, element, zoom) => {
  const threshold = 5 / zoom; 
  const p = { x, y };

  switch (element.type) {
    case 'line': return distanceToLine(p, { x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 }) < threshold;
    case 'rect':
      const minX = Math.min(element.x1, element.x2), maxX = Math.max(element.x1, element.x2);
      const minY = Math.min(element.y1, element.y2), maxY = Math.max(element.y1, element.y2);
      return (Math.abs(x - minX) < threshold || Math.abs(x - maxX) < threshold) && y >= minY && y <= maxY || 
             (Math.abs(y - minY) < threshold || Math.abs(y - maxY) < threshold) && x >= minX && x <= maxX;
    case 'dimension':
      const angle = Math.atan2(element.y2 - element.y1, element.x2 - element.x1);
      const dimX1 = element.x1 - Math.sin(angle) * element.offsetDist;
      const dimY1 = element.y1 + Math.cos(angle) * element.offsetDist;
      const dimX2 = element.x2 - Math.sin(angle) * element.offsetDist;
      const dimY2 = element.y2 + Math.cos(angle) * element.offsetDist;
      return distanceToLine(p, {x: dimX1, y: dimY1}, {x: dimX2, y: dimY2}) < threshold;
    case 'dimension_radial':
      return distanceToLine(p, {x: element.cx, y: element.cy}, {x: element.textX, y: element.textY}) < threshold || 
             distance(p, {x: element.textX, y: element.textY}) < threshold * 5;
    case 'image':
      const insideImg = x >= element.x && x <= element.x + element.width && y >= element.y && y <= element.y + element.height;
      return insideImg;
    case 'text':
      const rotRad = (element.rotation || 0) * Math.PI / 180;
      const dx = x - element.x, dy = y - element.y;
      const rx = dx * Math.cos(-rotRad) - dy * Math.sin(-rotRad);
      const ry = dx * Math.sin(-rotRad) + dy * Math.cos(-rotRad);
      const w = element.text.length * (element.fontSize || 24) * 0.6;
      const h = element.fontSize || 24;
      return rx >= -threshold && rx <= w + threshold && ry >= -threshold && ry <= h + threshold;
    case 'circle':
      const r = distance({ x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 });
      return Math.abs(distance(p, { x: element.x1, y: element.y1 }) - r) < threshold;
    case 'arc':
      if (Math.abs(distance(p, { x: element.x, y: element.y }) - element.r) > threshold) return false;
      let a = Math.atan2(p.y - element.y, p.x - element.x);
      if (a < 0) a += 2 * Math.PI;
      let sA = element.startAngle, eA = element.endAngle;
      while (sA < 0) sA += 2*Math.PI; sA %= 2*Math.PI;
      while (eA < 0) eA += 2*Math.PI; eA %= 2*Math.PI;
      return (sA < eA) ? (a >= sA && a <= eA) : (a >= sA || a <= eA);
    case 'block':
      return distance(p, {x: element.x, y: element.y}) < threshold * 5;
    case 'hatch':
      let insideHatch = false;
      if (element.points && element.points.length > 0) {
        for (let i = 0, j = element.points.length - 1; i < element.points.length; j = i++) {
          const xi = element.points[i].x, yi = element.points[i].y;
          const xj = element.points[j].x, yj = element.points[j].y;
          const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
          if (intersect) insideHatch = !insideHatch;
        }
        for (let i = 0; i < element.points.length - 1; i++) {
          if (distanceToLine(p, element.points[i], element.points[i+1]) < threshold) return true;
        }
        if (element.points.length > 2 && distanceToLine(p, element.points[element.points.length-1], element.points[0]) < threshold) return true;
      }
      return insideHatch;
    case 'pencil':
    case 'polyline':
      if (element.points) {
          for (let i = 0; i < element.points.length - 1; i++) {
            if (distanceToLine(p, element.points[i], element.points[i+1]) < threshold) return true;
          }
      }
      return false;
    default:
      return false;
  }
};

const PropInput = ({ label, value, onChange, onBlur }) => {
  const [localVal, setLocalVal] = useState(() => Number(value).toFixed(2));
  useEffect(() => { if (parseFloat(localVal) !== value && !isNaN(value)) setLocalVal(Number(value).toFixed(2)); }, [value]);
  return (
    <div className="flex justify-between items-center gap-2 mb-1">
      <label className="text-gray-400 flex-shrink-0 w-24 text-xs truncate" title={label}>{label}</label>
      <input type="number" step="any" className="bg-gray-800 text-white px-2 py-1 rounded w-full border border-gray-700 focus:border-blue-500 outline-none text-xs min-w-0"
        value={localVal} onChange={(e) => { setLocalVal(e.target.value); const num = parseFloat(e.target.value); if (!isNaN(num)) onChange(num); }}
        onBlur={() => { if (!isNaN(value)) setLocalVal(Number(value).toFixed(2)); if (onBlur) onBlur(); }}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
    </div>
  );
};

const PropSelectInput = ({ label, value, options, onChange }) => (
  <div className="flex justify-between items-center gap-2 mb-1">
    <label className="text-gray-400 flex-shrink-0 w-24 text-xs truncate" title={label}>{label}</label>
    <select className="bg-gray-800 text-white px-2 py-1 rounded w-full border border-gray-700 focus:border-blue-500 outline-none text-xs min-w-0 cursor-pointer"
      value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt, idx) => <option key={idx} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);

const PropCheckbox = ({ label, checked, onChange, onBlur }) => (
  <div className="flex justify-between items-center gap-2 mb-1">
    <label className="text-gray-400 flex-shrink-0 w-24 text-xs truncate" title={label}>{label}</label>
    <input type="checkbox" checked={!!checked} onChange={(e) => { onChange(e.target.checked); if (onBlur) onBlur(); }} className="cursor-pointer" />
  </div>
);

const PropColor = ({ label, value, onChange, disabled }) => (
  <div className="flex justify-between items-center gap-2 mb-1">
    <label className="text-gray-400 flex-shrink-0 w-24 text-xs truncate" title={label}>{label}</label>
    <input type="color" value={value || '#ffffff'} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`w-full h-6 p-0 border-0 rounded cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`} />
  </div>
);

const PropTextInput = ({ label, value, onChange, onBlur }) => {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => { setLocalVal(value); }, [value]);
  return (
    <div className="flex justify-between items-center gap-2 mb-1">
      <label className="text-gray-400 flex-shrink-0 w-24 text-xs truncate" title={label}>{label}</label>
      <input type="text" className="bg-gray-800 text-white px-2 py-1 rounded w-full border border-gray-700 focus:border-blue-500 outline-none text-xs min-w-0"
        value={localVal} onChange={(e) => { setLocalVal(e.target.value); onChange(e.target.value); }}
        onBlur={onBlur} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
    </div>
  );
};

export default function App() {
  const canvasRef = useRef(null);
  
  const [elements, setElements] = useState([]);
  const [history, setHistory] = useState([[]]);
  const [historyStep, setHistoryStep] = useState(0);
  
  const [action, setAction] = useState('none'); 
  const [tool, setTool] = useState('line'); 
  
  const [selectedId, setSelectedId] = useState(null);
  const [color, setColor] = useState('#00ff00'); 
  const [lineWidth, setLineWidth] = useState(2);
  
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); 
  const [startPanMouse, setStartPanMouse] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeGrip, setActiveGrip] = useState(null);
  
  const [showProperties, setShowProperties] = useState(false);
  const [propertiesPos, setPropertiesPos] = useState({ x: 0, y: 0 });

  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [osnapEnabled, setOsnapEnabled] = useState(true);
  const [activeSnap, setActiveSnap] = useState(null);

  const [layers, setLayers] = useState([{ id: 'layer1', name: 'Capa 1', color: '#00ff00', visible: true }]);
  const [activeLayerId, setActiveLayerId] = useState('layer1');
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  const [drawingStep, setDrawingStep] = useState(0);
  const imageCache = useRef({});
  const fileInputRef = useRef(null);
  const fileInputSvgRef = useRef(null);
  const fileInputDxfRef = useRef(null);
  const fileInputJsonRef = useRef(null);

  // --- ESTADOS DE BLOQUES ---
  const [blockDefs, setBlockDefs] = useState({});
  const [draftSelection, setDraftSelection] = useState([]);
  const [activeBlockName, setActiveBlockName] = useState('');
  const [showBlockPrompt, setShowBlockPrompt] = useState(false);
  const [newBlockName, setNewBlockName] = useState('');

  // --- ESTADOS DE IMPRESIÓN ---
  const [printStartPos, setPrintStartPos] = useState(null);
  const [printCurrentPos, setPrintCurrentPos] = useState(null);

  const updateHistory = useCallback((newElements) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
    setElements(newElements);
  }, [history, historyStep]);

  const undo = useCallback(() => {
    if (historyStep > 0) {
      setHistoryStep(historyStep - 1);
      setElements(history[historyStep - 1]);
      setSelectedId(null);
      setDraftSelection([]);
    }
  }, [history, historyStep]);

  const redo = useCallback(() => {
    if (historyStep < history.length - 1) {
      setHistoryStep(historyStep + 1);
      setElements(history[historyStep + 1]);
      setDraftSelection([]);
    }
  }, [history, historyStep]);

  const handleCreateBlock = () => {
    const name = newBlockName.trim();
    if (name !== '') {
        const selectedEls = elements.filter(el => draftSelection.includes(el.id));
        const bbox = getBoundingBox(selectedEls);
        const relativeEls = selectedEls.map(el => translateElement(el, -bbox.cx, -bbox.cy));
        setBlockDefs(prev => ({ ...prev, [name]: { elements: relativeEls, basePoint: { x: bbox.cx, y: bbox.cy } } }));
        if (!activeBlockName) setActiveBlockName(name);
        const remainingEls = elements.filter(el => !draftSelection.includes(el.id));
        const blockInstance = { id: Date.now(), type: 'block', layerId: activeLayerId, blockName: name, x: bbox.cx, y: bbox.cy, scale: 1, rotation: 0, color };
        const newElements = [...remainingEls, blockInstance];
        setElements(newElements); updateHistory(newElements); setDraftSelection([]); setTool('select'); setSelectedId(blockInstance.id);
    }
    setShowBlockPrompt(false);
    setNewBlockName('');
  };

  const getMousePosOnCanvas = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const screenToWorld = (screenX, screenY) => ({
    x: (screenX - camera.x) / camera.zoom,
    y: (screenY - camera.y) / camera.zoom
  });

  const getSnappedPos = (pos) => {
    if (!snapToGrid) return pos;
    return { x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE, y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE };
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    img.onload = () => {
      const centerWorld = screenToWorld(dimensions.width / 2, dimensions.height / 2);
      const newElement = {
        id: Date.now(), type: 'image', layerId: activeLayerId, url: url,
        x: centerWorld.x - img.width / 2, y: centerWorld.y - img.height / 2, width: img.width, height: img.height
      };
      updateHistory([...elements, newElement]);
    };
    e.target.value = ''; 
  };

  // --- MOTOR GLOBAL DE DIBUJO ---
  const drawShape = useCallback((element, ctx, isSelected, isDraft, zoom, isPrinting = false) => {
    const elLayer = layers.find(l => l.id === (element.layerId || 'layer1'));
    let objColor = (element.byLayer !== false && elLayer) ? elLayer.color : (element.color || '#ffffff');

    // Adaptación para impresión: Invertir trazos blancos o claros para que se vean en papel blanco
    if (isPrinting && (objColor.toLowerCase() === '#ffffff' || objColor.toLowerCase() === '#fff' || objColor.toLowerCase() === '#cccccc')) {
        objColor = '#000000';
    }

    ctx.beginPath();
    ctx.strokeStyle = objColor;
    ctx.lineWidth = (element.lineWidth || 2) / zoom;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (isSelected && !isPrinting) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 10 / zoom; ctx.strokeStyle = '#fff'; } 
    else if (isDraft && !isPrinting) { ctx.shadowColor = '#d946ef'; ctx.shadowBlur = 10 / zoom; ctx.strokeStyle = '#d946ef'; }
    else { ctx.shadowBlur = 0; }

    const activeColor = isSelected && !isPrinting ? '#fff' : (isDraft && !isPrinting ? '#d946ef' : objColor);

    if (element.type === 'line') {
      ctx.moveTo(element.x1, element.y1); ctx.lineTo(element.x2, element.y2);
    } else if (element.type === 'rect') {
      ctx.rect(element.x1, element.y1, element.x2 - element.x1, element.y2 - element.y1);
    } else if (element.type === 'circle') {
      const r = distance({ x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 });
      ctx.arc(element.x1, element.y1, r, 0, 2 * Math.PI);
    } else if (element.type === 'pencil' || element.type === 'polyline' || element.type === 'hatch') {
      if (element.points && element.points.length > 0) {
        ctx.moveTo(element.points[0].x, element.points[0].y);
        for (let i = 1; i < element.points.length; i++) ctx.lineTo(element.points[i].x, element.points[i].y);
        if (element.type === 'hatch') {
           ctx.closePath();
           const pCanvas = document.createElement('canvas'); const scale = Math.max(2, element.patternScale || 20); pCanvas.width = scale; pCanvas.height = scale; const pCtx = pCanvas.getContext('2d');
           pCtx.strokeStyle = activeColor; pCtx.fillStyle = activeColor; pCtx.lineWidth = (element.lineWidth||2) / zoom;
           const type = element.patternType || 'lines'; pCtx.beginPath();
           if (type === 'lines') { pCtx.moveTo(0, 0); pCtx.lineTo(0, scale); } 
           else if (type === 'cross') { pCtx.moveTo(0, 0); pCtx.lineTo(0, scale); pCtx.moveTo(0, 0); pCtx.lineTo(scale, 0); } 
           else if (type === 'dots') { pCtx.arc(scale/2, scale/2, pCtx.lineWidth, 0, Math.PI * 2); pCtx.fill(); } 
           else if (type === 'dashed') { pCtx.setLineDash([scale/4, scale/4]); pCtx.moveTo(0, 0); pCtx.lineTo(0, scale); } 
           else if (type === 'concrete') { pCtx.moveTo(scale*0.2, scale*0.8); pCtx.lineTo(scale*0.5, scale*0.2); pCtx.lineTo(scale*0.8, scale*0.8); pCtx.closePath(); pCtx.stroke(); pCtx.beginPath(); pCtx.arc(scale*0.3, scale*0.4, pCtx.lineWidth/2, 0, Math.PI*2); pCtx.fill(); pCtx.beginPath(); pCtx.arc(scale*0.7, scale*0.5, pCtx.lineWidth/2, 0, Math.PI*2); pCtx.fill(); } 
           else if (type === 'earth') { pCtx.moveTo(0, scale*0.2); pCtx.lineTo(scale*0.6, scale*0.2); pCtx.moveTo(scale*0.2, scale*0.5); pCtx.lineTo(scale*0.8, scale*0.5); pCtx.moveTo(scale*0.4, scale*0.8); pCtx.lineTo(scale*1.0, scale*0.8); }
           if (type !== 'dots' && type !== 'concrete') pCtx.stroke();
           const pattern = ctx.createPattern(pCanvas, 'repeat');
           if (pattern) { const domMatrix = new DOMMatrix(); pattern.setTransform(domMatrix.rotate(element.patternAngle || 45)); ctx.fillStyle = pattern; ctx.fill(); }
        }
      }
    } else if (element.type === 'arc') {
      ctx.arc(element.x, element.y, element.r, element.startAngle, element.endAngle, false);
    } else if (element.type === 'dimension') {
      const angle = Math.atan2(element.y2 - element.y1, element.x2 - element.x1); const nx = -Math.sin(angle), ny = Math.cos(angle), off = element.offsetDist;
      const dimX1 = element.x1 + nx * off, dimY1 = element.y1 + ny * off, dimX2 = element.x2 + nx * off, dimY2 = element.y2 + ny * off, gap = off > 0 ? 2 : -2;
      ctx.moveTo(element.x1 + nx * gap, element.y1 + ny * gap); ctx.lineTo(dimX1 + nx * gap, dimY1 + ny * gap); ctx.moveTo(element.x2 + nx * gap, element.y2 + ny * gap); ctx.lineTo(dimX2 + nx * gap, dimY2 + ny * gap);
      ctx.moveTo(dimX1, dimY1); ctx.lineTo(dimX2, dimY2);
      const tickSize = 6 / zoom, tickAngle = angle + Math.PI / 4, tx = Math.cos(tickAngle) * tickSize, ty = Math.sin(tickAngle) * tickSize;
      ctx.moveTo(dimX1 - tx, dimY1 - ty); ctx.lineTo(dimX1 + tx, dimY1 + ty); ctx.moveTo(dimX2 - tx, dimY2 - ty); ctx.lineTo(dimX2 + tx, dimY2 + ty); ctx.stroke();
      ctx.save(); ctx.translate((dimX1 + dimX2) / 2, (dimY1 + dimY2) / 2); let textAngle = angle; if (textAngle > Math.PI / 2 || textAngle <= -Math.PI / 2) textAngle += Math.PI;
      ctx.rotate(textAngle); ctx.fillStyle = activeColor; ctx.font = `${12 / zoom}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = off > 0 ? 'bottom' : 'top';
      ctx.fillText(distance({x: element.x1, y: element.y1}, {x: element.x2, y: element.y2}).toFixed(2), 0, off > 0 ? -4/zoom : 4/zoom); ctx.restore();
    } else if (element.type === 'dimension_radial') {
      const { cx, cy, r, textX, textY } = element; const angle = Math.atan2(textY - cy, textX - cx); const edgeX = cx + Math.cos(angle) * r, edgeY = cy + Math.sin(angle) * r;
      ctx.moveTo(cx, cy); ctx.lineTo(textX, textY);
      const arrowSize = 8 / zoom, arrAngle1 = angle + Math.PI - Math.PI/6, arrAngle2 = angle + Math.PI + Math.PI/6;
      ctx.moveTo(edgeX, edgeY); ctx.lineTo(edgeX + Math.cos(arrAngle1) * arrowSize, edgeY + Math.sin(arrAngle1) * arrowSize); ctx.moveTo(edgeX, edgeY); ctx.lineTo(edgeX + Math.cos(arrAngle2) * arrowSize, edgeY + Math.sin(arrAngle2) * arrowSize);
      const isLeft = textX < cx; ctx.moveTo(textX, textY); ctx.lineTo(isLeft ? textX - 20/zoom : textX + 20/zoom, textY); ctx.stroke();
      ctx.save(); ctx.fillStyle = activeColor; ctx.font = `${12 / zoom}px monospace`; ctx.textAlign = isLeft ? 'right' : 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`R${r.toFixed(2)}`, isLeft ? textX - 2/zoom : textX + 2/zoom, textY - 2/zoom); ctx.restore();
    } else if (element.type === 'text') {
      ctx.save(); ctx.fillStyle = activeColor; ctx.font = `${(element.fontSize || 24) / zoom}px ${element.fontFamily || 'Arial'}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      if (element.rotation) { ctx.translate(element.x, element.y); ctx.rotate(element.rotation * Math.PI / 180); ctx.fillText(element.text, 0, 0); } 
      else { ctx.fillText(element.text, element.x, element.y); }
      ctx.restore();
    } else if (element.type === 'image') {
      let img = imageCache.current[element.url];
      if (!img) { img = new Image(); img.src = element.url; img.onload = () => { setElements(els => [...els]); }; imageCache.current[element.url] = img; } 
      else if (img.complete) {
        ctx.save(); ctx.shadowBlur = (isSelected || isDraft) && !isPrinting ? 10 / zoom : 0; ctx.shadowColor = isSelected ? '#fff' : '#d946ef';
        ctx.drawImage(img, element.x, element.y, element.width, element.height); ctx.restore();
        if ((isSelected || isDraft) && !isPrinting) { ctx.strokeStyle = isSelected ? '#fff' : '#d946ef'; ctx.lineWidth = 2 / zoom; ctx.strokeRect(element.x, element.y, element.width, element.height); }
      }
    }
    if (!['image', 'dimension', 'dimension_radial', 'text'].includes(element.type)) ctx.stroke();
    ctx.shadowBlur = 0; 
  }, [layers]);

  // --- IMPORTACIÓN Y EXPORTACIÓN ---
  
  const getDXFEntity = (el, layersData) => {
    let res = "";
    const layer = layersData.find(l => l.id === el.layerId)?.name || '0';
    
    const addLine = (x1, y1, x2, y2) => `0\nLINE\n8\n${layer}\n10\n${x1}\n20\n${-y1}\n11\n${x2}\n21\n${-y2}\n`;
    
    if (el.type === 'line') {
      res += addLine(el.x1, el.y1, el.x2, el.y2);
    } else if (el.type === 'rect') {
      res += `0\nLWPOLYLINE\n8\n${layer}\n100\nAcDbEntity\n100\nAcDbPolyline\n90\n4\n70\n1\n`;
      res += `10\n${el.x1}\n20\n${-el.y1}\n10\n${el.x2}\n20\n${-el.y1}\n10\n${el.x2}\n20\n${-el.y2}\n10\n${el.x1}\n20\n${-el.y2}\n`;
    } else if (el.type === 'circle') {
      const r = distance({ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 });
      res += `0\nCIRCLE\n8\n${layer}\n10\n${el.x1}\n20\n${-el.y1}\n40\n${r}\n`;
    } else if (el.type === 'arc') {
      let sa = (-el.endAngle * 180 / Math.PI) % 360;
      let ea = (-el.startAngle * 180 / Math.PI) % 360;
      if (sa < 0) sa += 360; if (ea < 0) ea += 360;
      res += `0\nARC\n8\n${layer}\n10\n${el.x}\n20\n${-el.y}\n40\n${el.r}\n50\n${sa}\n51\n${ea}\n`;
    } else if (el.type === 'pencil' || el.type === 'polyline' || el.type === 'hatch') {
      if(el.points && el.points.length > 0) {
          const closed = el.type === 'hatch' ? 1 : 0;
          res += `0\nLWPOLYLINE\n8\n${layer}\n100\nAcDbEntity\n100\nAcDbPolyline\n90\n${el.points.length}\n70\n${closed}\n`;
          el.points.forEach(p => { res += `10\n${p.x}\n20\n${-p.y}\n`; });
      }
    } else if (el.type === 'text') {
      res += `0\nTEXT\n8\n${layer}\n10\n${el.x}\n20\n${-el.y}\n40\n${el.fontSize}\n1\n${el.text}\n50\n${-(el.rotation || 0)}\n`;
    } else if (el.type === 'dimension') {
      const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1); const nx = -Math.sin(angle), ny = Math.cos(angle), off = el.offsetDist;
      const dimX1 = el.x1 + nx * off, dimY1 = el.y1 + ny * off, dimX2 = el.x2 + nx * off, dimY2 = el.y2 + ny * off, gap = off > 0 ? 2 : -2;
      res += addLine(el.x1 + nx * gap, el.y1 + ny * gap, dimX1 + nx * gap, dimY1 + ny * gap);
      res += addLine(el.x2 + nx * gap, el.y2 + ny * gap, dimX2 + nx * gap, dimY2 + ny * gap);
      res += addLine(dimX1, dimY1, dimX2, dimY2);
      const tickSize = 6, tickAngle = angle + Math.PI / 4, tx = Math.cos(tickAngle) * tickSize, ty = Math.sin(tickAngle) * tickSize;
      res += addLine(dimX1 - tx, dimY1 - ty, dimX1 + tx, dimY1 + ty);
      res += addLine(dimX2 - tx, dimY2 - ty, dimX2 + tx, dimY2 + ty);
      const dist = distance({x: el.x1, y: el.y1}, {x: el.x2, y: el.y2});
      const midX = (dimX1 + dimX2) / 2, midY = (dimY1 + dimY2) / 2;
      let textAngle = angle * (180 / Math.PI); if (textAngle > 90 || textAngle <= -90) textAngle += 180;
      res += `0\nTEXT\n8\n${layer}\n10\n${midX}\n20\n${-(midY - (off > 0 ? 4 : -4))}\n40\n12\n1\n${dist.toFixed(2)}\n50\n${-textAngle}\n72\n1\n11\n${midX}\n21\n${-(midY - (off > 0 ? 4 : -4))}\n`;
    } else if (el.type === 'dimension_radial') {
      const { cx, cy, r, textX, textY } = el; const angle = Math.atan2(textY - cy, textX - cx); const edgeX = cx + Math.cos(angle) * r, edgeY = cy + Math.sin(angle) * r;
      res += addLine(cx, cy, textX, textY);
      const arrowSize = 8, arrAngle1 = angle + Math.PI - Math.PI/6, arrAngle2 = angle + Math.PI + Math.PI/6;
      res += addLine(edgeX, edgeY, edgeX + Math.cos(arrAngle1) * arrowSize, edgeY + Math.sin(arrAngle1) * arrowSize);
      res += addLine(edgeX, edgeY, edgeX + Math.cos(arrAngle2) * arrowSize, edgeY + Math.sin(arrAngle2) * arrowSize);
      const isLeft = textX < cx; const lx = isLeft ? textX - 20 : textX + 20;
      res += addLine(textX, textY, lx, textY);
      res += `0\nTEXT\n8\n${layer}\n10\n${isLeft ? textX - 2 : textX + 2}\n20\n${-(textY - 2)}\n40\n12\n1\nR${r.toFixed(2)}\n50\n0\n72\n${isLeft ? 2 : 0}\n11\n${isLeft ? textX - 2 : textX + 2}\n21\n${-(textY - 2)}\n`;
    } else if (el.type === 'block') {
      res += `0\nINSERT\n8\n${layer}\n2\n${el.blockName}\n10\n${el.x}\n20\n${-el.y}\n41\n${el.scale || 1}\n42\n${el.scale || 1}\n50\n${-(el.rotation || 0)}\n`;
    }
    return res;
  };

  const handleSvgImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const xmlDoc = new DOMParser().parseFromString(event.target.result, "image/svg+xml");
      let newElements = [];
      xmlDoc.querySelectorAll('line, rect, circle, polyline, polygon, path, text').forEach(node => {
        const tagName = node.tagName.toLowerCase();
        const stroke = node.getAttribute('stroke') || color;
        const fill = node.getAttribute('fill') || color;
        const sw = parseFloat(node.getAttribute('stroke-width')) || lineWidth;
        const eType = { id: Date.now() + Math.random(), layerId: activeLayerId, color: stroke, lineWidth: sw };

        if (tagName === 'line') newElements.push({ ...eType, type: 'line', x1: parseFloat(node.getAttribute('x1'))||0, y1: parseFloat(node.getAttribute('y1'))||0, x2: parseFloat(node.getAttribute('x2'))||0, y2: parseFloat(node.getAttribute('y2'))||0 });
        else if (tagName === 'rect') {
           const w = node.getAttribute('width'), h = node.getAttribute('height');
           if (w !== '100%') newElements.push({ ...eType, type: 'rect', x1: parseFloat(node.getAttribute('x'))||0, y1: parseFloat(node.getAttribute('y'))||0, x2: (parseFloat(node.getAttribute('x'))||0)+parseFloat(w), y2: (parseFloat(node.getAttribute('y'))||0)+parseFloat(h) });
        } else if (tagName === 'circle') {
           const cx = parseFloat(node.getAttribute('cx'))||0, cy = parseFloat(node.getAttribute('cy'))||0, r = parseFloat(node.getAttribute('r'))||0;
           newElements.push({ ...eType, type: 'circle', x1: cx, y1: cy, x2: cx+r, y2: cy });
        } else if (tagName === 'polyline' || tagName === 'polygon') {
           const pts = node.getAttribute('points');
           if (pts) {
               const points = pts.trim().split(/\s+|,/).reduce((acc, val, i, arr) => { if (i%2 === 0 && arr[i+1]) acc.push({ x: parseFloat(val), y: parseFloat(arr[i+1]) }); return acc; }, []);
               if (points.length > 0) { if (tagName === 'polygon') points.push({...points[0]}); newElements.push({ ...eType, type: 'polyline', points }); }
           }
        } else if (tagName === 'text') {
           let rotation = 0; const tr = node.getAttribute('transform');
           if (tr && tr.includes('rotate')) { const m = tr.match(/rotate\(\s*([-0-9.]+)/); if(m) rotation = parseFloat(m[1]); }
           newElements.push({ ...eType, type: 'text', x: parseFloat(node.getAttribute('x'))||0, y: parseFloat(node.getAttribute('y'))||0, text: node.textContent, fontSize: (parseFloat(node.getAttribute('font-size'))||24)*camera.zoom, fontFamily: node.getAttribute('font-family')||'Arial', rotation, color: fill !== 'none' ? fill : stroke });
        }
      });
      if (newElements.length > 0) updateHistory([...elements, ...newElements]);
    };
    reader.readAsText(file); e.target.value = '';
  };

  const handleDxfImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const lines = event.target.result.split(/\r?\n/).map(l => l.trim());
      let inBlocks = false, inEntities = false, currentEntity = null, currentBlockName = null, points = [];
      const newElements = [], newDefs = { ...blockDefs };

      for (let i = 0; i < lines.length; i += 2) {
        const code = parseInt(lines[i]), val = lines[i+1];
        if (code === 2 && val === 'BLOCKS') inBlocks = true;
        if (code === 0 && val === 'ENDSEC' && inBlocks) inBlocks = false;
        if (code === 2 && val === 'ENTITIES') inEntities = true;
        if (code === 0 && val === 'ENDSEC' && inEntities) inEntities = false;

        if (inBlocks && code === 0 && val === 'BLOCK') { currentBlockName = ''; continue; }
        if (inBlocks && currentBlockName !== null && code === 2) { currentBlockName = val; newDefs[val] = { elements: [], basePoint: {x:0, y:0} }; continue; }
        if (inBlocks && code === 0 && val === 'ENDBLK') {
            if (currentEntity && currentEntity.el.type) newDefs[currentBlockName].elements.push(currentEntity.el);
            currentEntity = null; currentBlockName = null; continue;
        }

        if ((inEntities || currentBlockName !== null) && code === 0) {
          if (currentEntity) {
            if (currentEntity.type === 'POLYLINE' || currentEntity.type === 'LWPOLYLINE') { if (points.length > 0) currentEntity.el.points = points; }
            if (currentEntity.el.type && (!currentEntity.el.points || currentEntity.el.points.length > 0)) {
               if (currentBlockName !== null) newDefs[currentBlockName].elements.push(currentEntity.el);
               else newElements.push(currentEntity.el);
            }
          }
          if (val === 'ENDBLK') continue;
          currentEntity = { type: val, el: { id: Date.now() + Math.random(), layerId: activeLayerId, color, lineWidth } };
          points = [];
          if (val === 'LINE') currentEntity.el.type = 'line';
          else if (val === 'CIRCLE') currentEntity.el.type = 'circle';
          else if (val === 'ARC') currentEntity.el.type = 'arc';
          else if (val === 'TEXT') { currentEntity.el.type = 'text'; currentEntity.el.fontSize = 24; currentEntity.el.fontFamily = 'Arial'; currentEntity.el.rotation = 0; }
          else if (val === 'LWPOLYLINE' || val === 'POLYLINE') { currentEntity.el.type = 'polyline'; currentEntity.el.points = []; }
          else if (val === 'INSERT') { currentEntity.el.type = 'block'; currentEntity.el.scale = 1; currentEntity.el.rotation = 0; }
        }

        if ((inEntities || currentBlockName !== null) && currentEntity) {
          const el = currentEntity.el;
          switch (currentEntity.type) {
            case 'LINE': if(code===10) el.x1=parseFloat(val); if(code===20) el.y1=-parseFloat(val); if(code===11) el.x2=parseFloat(val); if(code===21) el.y2=-parseFloat(val); break;
            case 'CIRCLE': case 'ARC': if(code===10) el.x=parseFloat(val); if(code===20) el.y=-parseFloat(val); if(code===40) el.r=parseFloat(val); if(code===50) el.startAngle=parseFloat(val)*Math.PI/180; if(code===51) el.endAngle=parseFloat(val)*Math.PI/180; break;
            case 'TEXT': if(code===1) el.text=val; if(code===10) el.x=parseFloat(val); if(code===20) el.y=-parseFloat(val); if(code===40) el.fontSize=parseFloat(val); if(code===50) el.rotation=-parseFloat(val); break;
            case 'LWPOLYLINE': case 'VERTEX': if(code===10) points.push({ x: parseFloat(val), y: 0 }); if(code===20 && points.length>0) points[points.length-1].y=-parseFloat(val); break;
            case 'INSERT': if(code===2) el.blockName=val; if(code===10) el.x=parseFloat(val); if(code===20) el.y=-parseFloat(val); if(code===41) el.scale=parseFloat(val); if(code===50) el.rotation=-parseFloat(val); break;
          }
        }
      }

      newElements.forEach(el => {
        if (el.type === 'circle') { el.x1=el.x; el.y1=el.y; el.x2=el.x+el.r; el.y2=el.y; } 
        else if (el.type === 'arc') { const sa=el.startAngle, ea=el.endAngle; el.startAngle=-ea; el.endAngle=-sa; }
      });
      Object.keys(newDefs).forEach(k => {
         newDefs[k].elements.forEach(el => {
            if (el.type === 'circle') { el.x1=el.x; el.y1=el.y; el.x2=el.x+el.r; el.y2=el.y; } 
            else if (el.type === 'arc') { const sa=el.startAngle, ea=el.endAngle; el.startAngle=-ea; el.endAngle=-sa; }
         });
      });

      setBlockDefs(newDefs);
      if (newElements.length > 0) updateHistory([...elements, ...newElements]);
    };
    reader.readAsText(file); e.target.value = '';
  };

  const handleJSONImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.elements) { setElements(data.elements); setHistory([data.elements]); setHistoryStep(0); }
        if (data.layers) setLayers(data.layers);
        if (data.blockDefs) setBlockDefs(data.blockDefs);
        setSelectedId(null); setDraftSelection([]); setAction('none'); setDrawingStep(0);
      } catch (err) { alert('Error al leer el archivo JSON. Formato inválido o corrupto.'); }
    };
    reader.readAsText(file); e.target.value = '';
  };

  const handlePrintArea = (start, end) => {
    const minX = Math.min(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    if (width < 5 || height < 5) {
       alert("El área seleccionada es demasiado pequeña para imprimir.");
       return;
    }

    const tempCanvas = document.createElement('canvas');
    const printScale = 4; // Escala alta resolución
    tempCanvas.width = width * printScale;
    tempCanvas.height = height * printScale;
    const ctx = tempCanvas.getContext('2d');

    // Fondo blanco puro
    ctx.fillStyle = '#ffffff'; 
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    ctx.save();
    ctx.scale(printScale, printScale);
    ctx.translate(-minX, -minY);

    elements.forEach(element => {
      const elLayer = layers.find(l => l.id === (element.layerId || 'layer1'));
      if (elLayer && !elLayer.visible) return;

      if (element.type === 'block') {
         const def = blockDefs[element.blockName];
         if (def) {
             ctx.save();
             ctx.translate(element.x, element.y);
             ctx.rotate((element.rotation || 0) * Math.PI / 180);
             const s = element.scale || 1;
             ctx.scale(s, s);
             def.elements.forEach(innerEl => drawShape(innerEl, ctx, false, false, 1 / s, true));
             ctx.restore();
         }
      } else {
         drawShape(element, ctx, false, false, 1, true); 
      }
    });
    ctx.restore();

    const dataUrl = tempCanvas.toDataURL('image/png');
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
       printWindow.document.write(`
         <html>
           <head>
             <title>Imprimir/Exportar Vista PDF</title>
             <style>
               @media print {
                 @page { margin: 0; size: auto; }
                 body { margin: 0; }
                 #hint { display: none; }
               }
               body { margin:0; display:flex; flex-direction:column; justify-content:center; align-items:center; background-color:#52525b; height:100vh; font-family:sans-serif; }
               #hint { padding: 10px; background: white; margin-bottom: 20px; border-radius: 8px; font-size: 14px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
             </style>
           </head>
           <body>
             <div id="hint"><b>Consejo:</b> Usa "Guardar como PDF" en el destino de tu impresora.</div>
             <img src="${dataUrl}" style="max-width:100%; max-height:calc(100vh - 80px); box-shadow:0 0 20px rgba(0,0,0,0.8);" onload="setTimeout(() => window.print(), 500);" />
           </body>
         </html>
       `);
       printWindow.document.close();
    } else {
       alert("Por favor, permite las ventanas emergentes (pop-ups) en tu navegador para poder imprimir.");
    }
  };

  const exportToPNG = () => {
    const canvas = canvasRef.current;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext('2d');
    ctx.fillStyle = '#111827'; 
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.drawImage(canvas, 0, 0);
    
    const dataUrl = tempCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'minicad_export.png';
    link.href = dataUrl;
    link.click();
  };

  const exportToSVG = () => {
    let svgDefs = `<defs>\n`;
    let svgBody = `  <g transform="translate(${camera.x}, ${camera.y}) scale(${camera.zoom})">\n`;
    
    if (showGrid) {
      const startX = Math.floor((-camera.x / camera.zoom) / GRID_SIZE) * GRID_SIZE;
      const endX = startX + (dimensions.width / camera.zoom) + GRID_SIZE;
      const startY = Math.floor((-camera.y / camera.zoom) / GRID_SIZE) * GRID_SIZE;
      const endY = startY + (dimensions.height / camera.zoom) + GRID_SIZE;

      svgBody += `  <g stroke="#334155" stroke-width="${1 / camera.zoom}">\n`;
      for (let x = startX; x <= endX; x += GRID_SIZE) {
        svgBody += `    <line x1="${x}" y1="${startY}" x2="${x}" y2="${endY}" />\n`;
      }
      for (let y = startY; y <= endY; y += GRID_SIZE) {
        svgBody += `    <line x1="${startX}" y1="${y}" x2="${endX}" y2="${y}" />\n`;
      }
      svgBody += `    <line x1="0" y1="${startY}" x2="0" y2="${endY}" stroke="#475569" stroke-width="${2 / camera.zoom}" />\n`;
      svgBody += `    <line x1="${startX}" y1="0" x2="${endX}" y2="0" stroke="#475569" stroke-width="${2 / camera.zoom}" />\n`;
      svgBody += `  </g>\n`;
    }

    const renderSVGElement = (element) => {
      const elLayer = layers.find(l => l.id === (element.layerId || 'layer1'));
      if (elLayer && !elLayer.visible) return "";

      const sw = (element.lineWidth || 2) / camera.zoom;
      const color = (element.byLayer !== false && elLayer) ? elLayer.color : (element.color || '#ffffff');
      let res = "";

      if (element.type === 'line') {
        res += `    <line x1="${element.x1}" y1="${element.y1}" x2="${element.x2}" y2="${element.y2}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" />\n`;
      } else if (element.type === 'rect') {
        const minX = Math.min(element.x1, element.x2), minY = Math.min(element.y1, element.y2);
        res += `    <rect x="${minX}" y="${minY}" width="${Math.abs(element.x2 - element.x1)}" height="${Math.abs(element.y2 - element.y1)}" stroke="${color}" stroke-width="${sw}" fill="none" />\n`;
      } else if (element.type === 'circle') {
        const r = distance({ x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 });
        res += `    <circle cx="${element.x1}" cy="${element.y1}" r="${r}" stroke="${color}" stroke-width="${sw}" fill="none" />\n`;
      } else if (element.type === 'pencil' || element.type === 'polyline') {
        if (element.points) {
          const d = element.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          res += `    <path d="${d}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round" />\n`;
        }
      } else if (element.type === 'hatch') {
        if (element.points && element.points.length > 2) {
          const defsId = `hatch_${element.id}`;
          const scale = Math.max(2, element.patternScale || 20);
          const angle = element.patternAngle || 45;
          const type = element.patternType || 'lines';
          let patContent = '';
          
          if (type === 'lines') patContent = `<line x1="0" y1="0" x2="0" y2="${scale}" stroke="${color}" stroke-width="${sw}" />`;
          else if (type === 'cross') patContent = `<line x1="0" y1="0" x2="0" y2="${scale}" stroke="${color}" stroke-width="${sw}" /><line x1="0" y1="0" x2="${scale}" y2="0" stroke="${color}" stroke-width="${sw}" />`;
          else if (type === 'dots') patContent = `<circle cx="${scale/2}" cy="${scale/2}" r="${sw}" fill="${color}" />`;
          else if (type === 'dashed') patContent = `<line x1="0" y1="0" x2="0" y2="${scale}" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${scale/4},${scale/4}" />`;
          else if (type === 'concrete') patContent = `<polygon points="${scale*0.2},${scale*0.8} ${scale*0.5},${scale*0.2} ${scale*0.8},${scale*0.8}" stroke="${color}" stroke-width="${sw}" fill="none" /><circle cx="${scale*0.3}" cy="${scale*0.4}" r="${sw/2}" fill="${color}" /><circle cx="${scale*0.7}" cy="${scale*0.5}" r="${sw/2}" fill="${color}" />`;
          else if (type === 'earth') patContent = `<line x1="0" y1="${scale*0.2}" x2="${scale*0.6}" y2="${scale*0.2}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" /><line x1="${scale*0.2}" y1="${scale*0.5}" x2="${scale*0.8}" y2="${scale*0.5}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" /><line x1="${scale*0.4}" y1="${scale*0.8}" x2="${scale}" y2="${scale*0.8}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" />`;

          svgDefs += `  <pattern id="${defsId}" width="${scale}" height="${scale}" patternTransform="rotate(${angle})" patternUnits="userSpaceOnUse">\n    ${patContent}\n  </pattern>\n`;
          const pts = element.points.map(p => `${p.x},${p.y}`).join(' ');
          res += `    <polygon points="${pts}" fill="url(#${defsId})" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" />\n`;
        }
      } else if (element.type === 'arc') {
        const cx = element.x, cy = element.y, r = element.r;
        const sa = element.startAngle, ea = element.endAngle;
        const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
        const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
        let diff = ea - sa;
        while (diff < 0) diff += 2 * Math.PI;
        const largeArcFlag = diff > Math.PI ? 1 : 0;
        res += `    <path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round" />\n`;
      } else if (element.type === 'dimension') {
        const angle = Math.atan2(element.y2 - element.y1, element.x2 - element.x1); const nx = -Math.sin(angle), ny = Math.cos(angle), off = element.offsetDist;
        const dimX1 = element.x1 + nx * off, dimY1 = element.y1 + ny * off, dimX2 = element.x2 + nx * off, dimY2 = element.y2 + ny * off, gap = off > 0 ? 2 : -2;
        const tickSize = 6 / camera.zoom, tickAngle = angle + Math.PI / 4, tx = Math.cos(tickAngle) * tickSize, ty = Math.sin(tickAngle) * tickSize;
        const d = `M ${element.x1 + nx*gap} ${element.y1 + ny*gap} L ${dimX1 + nx*gap} ${dimY1 + ny*gap} M ${element.x2 + nx*gap} ${element.y2 + ny*gap} L ${dimX2 + nx*gap} ${dimY2 + ny*gap} M ${dimX1} ${dimY1} L ${dimX2} ${dimY2} M ${dimX1 - tx} ${dimY1 - ty} L ${dimX1 + tx} ${dimY1 + ty} M ${dimX2 - tx} ${dimY2 - ty} L ${dimX2 + tx} ${dimY2 + ty}`;
        res += `    <path d="${d}" stroke="${color}" stroke-width="${sw}" fill="none" />\n`;
        const dist = distance({x: element.x1, y: element.y1}, {x: element.x2, y: element.y2});
        const midX = (dimX1 + dimX2) / 2, midY = (dimY1 + dimY2) / 2;
        let textAngle = angle * (180 / Math.PI);
        if (textAngle > 90 || textAngle <= -90) textAngle += 180;
        res += `    <text x="0" y="${off > 0 ? -4/camera.zoom : 12/camera.zoom}" fill="${color}" font-family="monospace" font-size="${12 / camera.zoom}" text-anchor="middle" transform="translate(${midX}, ${midY}) rotate(${textAngle})">${dist.toFixed(2)}</text>\n`;
      } else if (element.type === 'dimension_radial') {
        const { cx, cy, r, textX, textY } = element; const angle = Math.atan2(textY - cy, textX - cx); const edgeX = cx + Math.cos(angle) * r, edgeY = cy + Math.sin(angle) * r;
        const arrowSize = 8 / camera.zoom, arrAngle1 = angle + Math.PI - Math.PI/6, arrAngle2 = angle + Math.PI + Math.PI/6;
        const a1x = edgeX + Math.cos(arrAngle1) * arrowSize, a1y = edgeY + Math.sin(arrAngle1) * arrowSize;
        const a2x = edgeX + Math.cos(arrAngle2) * arrowSize, a2y = edgeY + Math.sin(arrAngle2) * arrowSize;
        const isLeft = textX < cx; const lx = isLeft ? textX - 20/camera.zoom : textX + 20/camera.zoom;
        const d = `M ${cx} ${cy} L ${textX} ${textY} M ${edgeX} ${edgeY} L ${a1x} ${a1y} M ${edgeX} ${edgeY} L ${a2x} ${a2y} M ${textX} ${textY} L ${lx} ${textY}`;
        res += `    <path d="${d}" stroke="${color}" stroke-width="${sw}" fill="none" />\n`;
        res += `    <text x="${isLeft ? textX - 2/camera.zoom : textX + 2/camera.zoom}" y="${textY - 2/camera.zoom}" fill="${color}" font-family="monospace" font-size="${12 / camera.zoom}" text-anchor="${isLeft ? "end" : "start"}">R${r.toFixed(2)}</text>\n`;
      } else if (element.type === 'text') {
        const rotStr = element.rotation ? ` rotate(${element.rotation} ${element.x} ${element.y})` : '';
        res += `    <text x="${element.x}" y="${element.y}" fill="${color}" font-family="${element.fontFamily || 'Arial'}" font-size="${(element.fontSize || 24) / camera.zoom}" transform="${rotStr}" dominant-baseline="hanging">${element.text}</text>\n`;
      } else if (element.type === 'image') {
        res += `    <image href="${element.url}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" />\n`;
      } else if (element.type === 'block') {
        res += `    <use href="#blk_${element.blockName}" x="0" y="0" transform="translate(${element.x}, ${element.y}) rotate(${element.rotation || 0}) scale(${element.scale || 1})" />\n`;
      }
      return res;
    };

    Object.keys(blockDefs).forEach(bName => {
      svgDefs += `  <g id="blk_${bName}">\n`;
      blockDefs[bName].elements.forEach(el => { svgDefs += renderSVGElement(el); });
      svgDefs += `  </g>\n`;
    });

    elements.forEach(element => {
      svgBody += renderSVGElement(element);
    });

    svgDefs += `</defs>\n`;
    svgBody += `  </g>\n`;

    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">\n`;
    svgContent += svgDefs;
    svgContent += `  <rect width="100%" height="100%" fill="#111827"/>\n`;
    svgContent += svgBody;
    svgContent += `</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'minicad_export.svg';
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToDXF = () => {
    let dxf = "0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n" + layers.length + "\n";
    layers.forEach(l => { dxf += `0\nLAYER\n2\n${l.name}\n70\n0\n62\n7\n`; });
    dxf += "0\nENDTAB\n0\nENDSEC\n";

    dxf += "0\nSECTION\n2\nBLOCKS\n";
    Object.keys(blockDefs).forEach(bName => {
       const def = blockDefs[bName];
       dxf += `0\nBLOCK\n8\n0\n2\n${bName}\n70\n0\n10\n0\n20\n0\n30\n0\n3\n${bName}\n`;
       def.elements.forEach(el => { dxf += getDXFEntity(el, layers); });
       dxf += `0\nENDBLK\n8\n0\n`;
    });
    dxf += "0\nENDSEC\n";

    dxf += "0\nSECTION\n2\nENTITIES\n";
    elements.forEach(el => { dxf += getDXFEntity(el, layers); });
    dxf += "0\nENDSEC\n0\nEOF\n";
    
    const blob = new Blob([dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'minicad_export.dxf';
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    const projectData = { elements, layers, blockDefs };
    const jsonString = JSON.stringify(projectData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'minicad_proyecto.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  // --- MANEJO DE EVENTOS DEL RATÓN ---
  const handleMouseDown = (e) => {
    const screenPos = getMousePosOnCanvas(e);
    let worldPos = screenToWorld(screenPos.x, screenPos.y);
    
    setShowProperties(false); 

    if (e.button === 1 || tool === 'pan') { 
      setAction('panning');
      setStartPanMouse(screenPos);
      return;
    }

    if (e.button === 2) return; 

    // Herramientas RECORTAR / ALARGAR
    if (tool === 'trim' || tool === 'extend') {
       let foundLine = null;
       for (let i = elements.length - 1; i >= 0; i--) {
           const el = elements[i];
           const elLayer = layers.find(l => l.id === (el.layerId || 'layer1'));
           if (elLayer && !elLayer.visible) continue;
           if (el.type === 'line' && isPointNearElement(worldPos.x, worldPos.y, el, camera.zoom)) {
               foundLine = el; break;
           }
       }

       if (foundLine) {
           const dist1 = distance(worldPos, {x: foundLine.x1, y: foundLine.y1});
           const dist2 = distance(worldPos, {x: foundLine.x2, y: foundLine.y2});
           const modifyP2 = dist2 < dist1;
           
           const A = modifyP2 ? {x: foundLine.x1, y: foundLine.y1} : {x: foundLine.x2, y: foundLine.y2};
           const B = modifyP2 ? {x: foundLine.x2, y: foundLine.y2} : {x: foundLine.x1, y: foundLine.y1};
           
           let intersections = [];
           elements.forEach(el => {
               if (el.id === foundLine.id) return; 
               const elLayer = layers.find(l => l.id === (el.layerId || 'layer1'));
               if (elLayer && !elLayer.visible) return;

               if (el.type === 'circle') {
                   const r = distance({x:el.x1, y:el.y1}, {x:el.x2, y:el.y2});
                   intersections.push(...getLineCircleIntersections(A, B, {x: el.x1, y: el.y1}, r));
               } else if (el.type === 'arc') {
                   const circInts = getLineCircleIntersections(A, B, {x: el.x, y: el.y}, el.r);
                   circInts.forEach(ci => {
                       let angle = Math.atan2(ci.y - el.y, ci.x - el.x);
                       if (angle < 0) angle += 2*Math.PI;
                       let sA = el.startAngle, eA = el.endAngle;
                       while(sA < 0) sA += 2*Math.PI; sA %= 2*Math.PI;
                       while(eA < 0) eA += 2*Math.PI; eA %= 2*Math.PI;
                       const inArc = (sA < eA) ? (angle >= sA && angle <= eA) : (angle >= sA || angle <= eA);
                       if (inArc) intersections.push(ci);
                   });
               } else {
                   // Utiliza extractSegments que también extrae de bloques internamente
                   const segs = extractSegments(el, blockDefs);
                   segs.forEach(seg => {
                       const intPt = getLineInfiniteIntersection(A, B, seg[0], seg[1]);
                       if (intPt) intersections.push(intPt);
                   });
               }
           });

           let bestT = null;
           if (tool === 'trim') {
               let maxT = -Infinity;
               intersections.forEach(i => { if (i.t > 0.001 && i.t < 0.999 && i.t > maxT) maxT = i.t; });
               if (maxT > -Infinity) bestT = maxT;
           } else if (tool === 'extend') {
               let minT = Infinity;
               intersections.forEach(i => { if (i.t > 1.001 && i.t < minT) minT = i.t; });
               if (minT < Infinity) bestT = minT;
           }

           if (bestT !== null) {
               const newB = { x: A.x + bestT * (B.x - A.x), y: A.y + bestT * (B.y - A.y) };
               const updatedLine = { ...foundLine };
               if (modifyP2) { updatedLine.x2 = newB.x; updatedLine.y2 = newB.y; } 
               else { updatedLine.x1 = newB.x; updatedLine.y1 = newB.y; }
               const newEls = elements.map(e => e.id === foundLine.id ? updatedLine : e);
               updateHistory(newEls);
           }
       }
       return; 
    }

    // Herramienta IMPRIMIR/PDF VISTA
    if (tool === 'print') {
        setAction('selecting_print');
        setPrintStartPos(worldPos);
        setPrintCurrentPos(worldPos);
        return;
    }

    let activeStart = null;
    let excludeId = null;

    if (action === 'drawing' && elements.length > 0) {
        const el = elements[elements.length - 1];
        excludeId = el.id;
        if (tool === 'line') activeStart = { x: el.x1, y: el.y1 };
    } else if ((action === 'drawing_poly' || action === 'drawing_hatch') && elements.length > 0) {
        const el = elements[elements.length - 1];
        excludeId = el.id;
        if (el.points && el.points.length > 1) activeStart = el.points[el.points.length - 2];
    } else if (action === 'moving' && selectedId) {
        excludeId = selectedId;
    } else if (action === 'resizing' && selectedId) {
        excludeId = selectedId;
    }

    if (osnapEnabled && tool !== 'pan' && tool !== 'select' && tool !== 'make_block' && tool !== 'trim' && tool !== 'extend' && action !== 'panning') {
        const snap = findOsnap(worldPos, elements, 15 / camera.zoom, activeStart, excludeId, layers, blockDefs);
        if (snap) { worldPos = { x: snap.x, y: snap.y }; setActiveSnap(snap); }
        else if (snapToGrid) { worldPos = getSnappedPos(worldPos); setActiveSnap(null); }
    } else if (snapToGrid) {
        worldPos = getSnappedPos(worldPos);
    }

    // Herramienta CREAR BLOQUE
    if (tool === 'make_block') {
      let found = null;
      for (let i = elements.length - 1; i >= 0; i--) {
        const elLayer = layers.find(l => l.id === (elements[i].layerId || 'layer1'));
        if (elLayer && !elLayer.visible) continue;
        if (isPointNearElement(worldPos.x, worldPos.y, elements[i], camera.zoom)) { found = elements[i]; break; }
      }
      if (found) {
         if (draftSelection.includes(found.id)) setDraftSelection(draftSelection.filter(id => id !== found.id));
         else setDraftSelection([...draftSelection, found.id]);
      }
      return;
    }

    // Herramienta INSERTAR BLOQUE
    if (tool === 'insert_block') {
        if (activeBlockName && blockDefs[activeBlockName]) {
            const newElement = {
                id: Date.now(), type: 'block', layerId: activeLayerId, blockName: activeBlockName,
                x: worldPos.x, y: worldPos.y, scale: 1, rotation: 0, color
            };
            const newElements = [...elements, newElement];
            setElements(newElements); updateHistory(newElements);
            setTool('select'); setSelectedId(newElement.id);
        } else {
            alert('Por favor, selecciona un bloque existente en el desplegable de arriba primero.');
        }
        return;
    }

    if (tool === 'select' || tool === 'copy_tool') {
      if (selectedId && tool === 'select') {
        const selEl = elements.find(el => el.id === selectedId);
        if (selEl) {
          const gs = 12 / camera.zoom; let grips = [];
          if (selEl.type === 'image') { const { x, y, width, height } = selEl; grips = [{id:'img_tl',px:x,py:y},{id:'img_tr',px:x+width,py:y},{id:'img_bl',px:x,py:y+height},{id:'img_br',px:x+width,py:y+height}]; }
          else if (selEl.type === 'line') grips = [{id:'line_p1',px:selEl.x1,py:selEl.y1},{id:'line_p2',px:selEl.x2,py:selEl.y2},{id:'line_c',px:(selEl.x1+selEl.x2)/2,py:(selEl.y1+selEl.y2)/2}];
          else if (selEl.type === 'rect') grips = [{id:'r_tl',px:selEl.x1,py:selEl.y1},{id:'r_tr',px:selEl.x2,py:selEl.y1},{id:'r_bl',px:selEl.x1,py:selEl.y2},{id:'r_br',px:selEl.x2,py:selEl.y2}];
          else if (selEl.type === 'circle') { const r = distance({x:selEl.x1,y:selEl.y1},{x:selEl.x2,y:selEl.y2}); grips = [{id:'circ_c',px:selEl.x1,py:selEl.y1},{id:'circ_r',px:selEl.x1+r,py:selEl.y1},{id:'circ_r',px:selEl.x1-r,py:selEl.y1},{id:'circ_r',px:selEl.x1,py:selEl.y1+r},{id:'circ_r',px:selEl.x1,py:selEl.y1-r}]; }
          else if (selEl.type === 'pencil' || selEl.type === 'polyline' || selEl.type === 'hatch') grips = selEl.points.map((p,i)=>({id:`pt_${i}`,px:p.x,py:p.y}));
          else if (selEl.type === 'arc') grips = [{id:'arc_c',px:selEl.x,py:selEl.y},{id:'arc_s',px:selEl.x+selEl.r*Math.cos(selEl.startAngle),py:selEl.y+selEl.r*Math.sin(selEl.startAngle)},{id:'arc_e',px:selEl.x+selEl.r*Math.cos(selEl.endAngle),py:selEl.y+selEl.r*Math.sin(selEl.endAngle)}];
          else if (selEl.type === 'dimension') { const ang=Math.atan2(selEl.y2-selEl.y1,selEl.x2-selEl.x1); grips = [{id:'dim_p1',px:selEl.x1,py:selEl.y1},{id:'dim_p2',px:selEl.x2,py:selEl.y2},{id:'dim_off',px:(selEl.x1+selEl.x2)/2-Math.sin(ang)*selEl.offsetDist,py:(selEl.y1+selEl.y2)/2+Math.cos(ang)*selEl.offsetDist}]; }
          else if (selEl.type === 'dimension_radial') grips = [{id:'dimr_c',px:selEl.cx,py:selEl.cy},{id:'dimr_t',px:selEl.textX,py:selEl.textY}];
          else if (selEl.type === 'text') grips = [{id:'txt_p',px:selEl.x,py:selEl.y}];
          else if (selEl.type === 'block') grips = [{id:'blk_p',px:selEl.x,py:selEl.y}];

          for (const g of grips) { if (distance(worldPos, {x: g.px, y: g.py}) < gs) { setAction('resizing'); setActiveGrip(g.id); return; } }
        }
      }

      let found = null;
      for (let i = elements.length - 1; i >= 0; i--) {
        const elLayer = layers.find(l => l.id === (elements[i].layerId || 'layer1'));
        if (elLayer && !elLayer.visible) continue;
        if (isPointNearElement(worldPos.x, worldPos.y, elements[i], camera.zoom)) { found = elements[i]; break; }
      }

      if (found) {
        let elToManipulate = found;
        let currentElements = elements;

        if (tool === 'copy_tool') {
           elToManipulate = JSON.parse(JSON.stringify(found));
           elToManipulate.id = Date.now() + Math.random();
           currentElements = [...elements, elToManipulate];
           setElements(currentElements);
        }

        setSelectedId(elToManipulate.id);
        if(tool === 'select') setColor(elToManipulate.color || '#00ff00'); 
        setAction('moving');
        
        let refX = 0, refY = 0;
        if (elToManipulate.x1 !== undefined) { refX = elToManipulate.x1; refY = elToManipulate.y1; }
        else if (elToManipulate.cx !== undefined) { refX = elToManipulate.cx; refY = elToManipulate.cy; }
        else if (elToManipulate.x !== undefined) { refX = elToManipulate.x; refY = elToManipulate.y; }
        else if (elToManipulate.points && elToManipulate.points.length > 0) { refX = elToManipulate.points[0].x; refY = elToManipulate.points[0].y; }

        setDragOffset({ x: worldPos.x - refX, y: worldPos.y - refY });
      } else {
        if (tool === 'select') setSelectedId(null);
      }
      return;
    }

    if (tool === 'text') {
      const newElement = { id: Date.now(), type: 'text', layerId: activeLayerId, x: worldPos.x, y: worldPos.y, text: 'Texto', fontSize: 24, fontFamily: 'Arial', rotation: 0, color };
      const newElements = [...elements, newElement];
      setElements(newElements); updateHistory(newElements);
      setSelectedId(newElement.id); setTool('select'); 
      return;
    }

    if (tool === 'polyline' || tool === 'hatch') {
      const actName = tool === 'hatch' ? 'drawing_hatch' : 'drawing_poly';
      if (drawingStep === 0) {
        setAction(actName); setDrawingStep(1); setSelectedId(null);
        const newElement = { id: Date.now(), type: tool, layerId: activeLayerId, color, lineWidth, points: [{ ...worldPos }, { ...worldPos }], patternScale: tool === 'hatch' ? 20 : undefined, patternAngle: tool === 'hatch' ? 45 : undefined, patternType: tool === 'hatch' ? 'lines' : undefined };
        setElements([...elements, newElement]);
      } else if (drawingStep === 1) {
        const index = elements.length - 1; const updatedElement = { ...elements[index] };
        updatedElement.points = [...updatedElement.points, { ...worldPos }];
        const elementsCopy = [...elements]; elementsCopy[index] = updatedElement; setElements(elementsCopy);
      }
      return;
    }

    if (tool === 'arc') {
      if (drawingStep === 0) {
        setAction('drawing_arc'); setDrawingStep(1); setSelectedId(null);
        const newElement = { id: Date.now(), type: 'arc', layerId: activeLayerId, color, lineWidth, x: worldPos.x, y: worldPos.y, r: 0, startAngle: 0, endAngle: 2 * Math.PI };
        setElements([...elements, newElement]);
      } else if (drawingStep === 1) setDrawingStep(2);
      else if (drawingStep === 2) { setDrawingStep(0); setAction('none'); updateHistory(elements); }
      return;
    }

    if (tool === 'dimension') {
      if (drawingStep === 0) {
        setAction('drawing_dimension'); setDrawingStep(1); setSelectedId(null);
        const newElement = { id: Date.now(), type: 'dimension', layerId: activeLayerId, color, lineWidth, x1: worldPos.x, y1: worldPos.y, x2: worldPos.x, y2: worldPos.y, offsetDist: 20 };
        setElements([...elements, newElement]);
      } else if (drawingStep === 1) setDrawingStep(2);
      else if (drawingStep === 2) { setDrawingStep(0); setAction('none'); updateHistory(elements); }
      return;
    }

    if (tool === 'dimension_radial') {
      if (drawingStep === 0) {
        let target = null;
        for (let i = elements.length - 1; i >= 0; i--) {
          const elLayer = layers.find(l => l.id === (elements[i].layerId || 'layer1')); if (elLayer && !elLayer.visible) continue;
          if ((elements[i].type === 'circle' || elements[i].type === 'arc') && isPointNearElement(worldPos.x, worldPos.y, elements[i], camera.zoom)) { target = elements[i]; break; }
        }
        if (target) {
          setAction('drawing_dimension_radial'); setDrawingStep(1); setSelectedId(null);
          let cx = target.type === 'circle' ? target.x1 : target.x, cy = target.type === 'circle' ? target.y1 : target.y, r = target.type === 'circle' ? distance({x: target.x1, y: target.y1}, {x: target.x2, y: target.y2}) : target.r;
          setElements([...elements, { id: Date.now(), type: 'dimension_radial', layerId: activeLayerId, color, lineWidth, cx, cy, r, textX: worldPos.x, textY: worldPos.y }]);
        }
      } else if (drawingStep === 1) { setDrawingStep(0); setAction('none'); updateHistory(elements); }
      return;
    }

    setAction('drawing'); setSelectedId(null);
    setElements([...elements, { id: Date.now(), type: tool, layerId: activeLayerId, x1: worldPos.x, y1: worldPos.y, x2: worldPos.x, y2: worldPos.y, color, lineWidth, points: tool === 'pencil' ? [{ x: worldPos.x, y: worldPos.y }] : undefined }]);
  };

  const handleMouseMove = (e) => {
    const screenPos = getMousePosOnCanvas(e);
    let worldPos = screenToWorld(screenPos.x, screenPos.y);
    setMousePos(worldPos);

    if (action === 'panning') {
      setCamera(prev => ({ ...prev, x: prev.x + (screenPos.x - startPanMouse.x), y: prev.y + (screenPos.y - startPanMouse.y) }));
      setStartPanMouse(screenPos); return;
    }

    if (action === 'selecting_print') {
        setPrintCurrentPos(worldPos);
        return;
    }

    let activeStart = null, excludeId = null;
    if (action === 'drawing' && elements.length > 0) { const el = elements[elements.length - 1]; excludeId = el.id; if (tool === 'line') activeStart = { x: el.x1, y: el.y1 }; } 
    else if ((action === 'drawing_poly' || action === 'drawing_hatch') && elements.length > 0) { const el = elements[elements.length - 1]; excludeId = el.id; if (el.points && el.points.length > 1) activeStart = el.points[el.points.length - 2]; } 
    else if ((action === 'moving' || action === 'resizing') && selectedId) excludeId = selectedId;

    if (osnapEnabled && tool !== 'pan' && tool !== 'trim' && tool !== 'extend' && action !== 'panning') {
        const snap = findOsnap(worldPos, elements, 15 / camera.zoom, activeStart, excludeId, layers, blockDefs);
        if (snap) { worldPos = { x: snap.x, y: snap.y }; setActiveSnap(snap); }
        else { setActiveSnap(null); if (snapToGrid) worldPos = getSnappedPos(worldPos); }
    } else { setActiveSnap(null); if (snapToGrid) worldPos = getSnappedPos(worldPos); }

    if (action === 'drawing') {
      const index = elements.length - 1; const updatedElement = { ...elements[index] };
      if (e.shiftKey && tool !== 'pencil') {
        if (tool === 'line') { const dx = Math.abs(worldPos.x - updatedElement.x1), dy = Math.abs(worldPos.y - updatedElement.y1); if (dx > dy) worldPos.y = updatedElement.y1; else worldPos.x = updatedElement.x1; } 
        else if (tool === 'rect') { const size = Math.max(Math.abs(worldPos.x - updatedElement.x1), Math.abs(worldPos.y - updatedElement.y1)); worldPos.x = updatedElement.x1 + (worldPos.x > updatedElement.x1 ? size : -size); worldPos.y = updatedElement.y1 + (worldPos.y > updatedElement.y1 ? size : -size); }
      }
      if (tool === 'pencil') updatedElement.points = [...updatedElement.points, { x: worldPos.x, y: worldPos.y }];
      else { updatedElement.x2 = worldPos.x; updatedElement.y2 = worldPos.y; }
      const elementsCopy = [...elements]; elementsCopy[index] = updatedElement; setElements(elementsCopy);
    } else if (action === 'drawing_poly' || action === 'drawing_hatch') {
      const index = elements.length - 1; const updatedElement = { ...elements[index] };
      if (e.shiftKey) {
         const prevPoint = updatedElement.points[updatedElement.points.length - 2];
         const dx = Math.abs(worldPos.x - prevPoint.x), dy = Math.abs(worldPos.y - prevPoint.y);
         if (dx > dy) worldPos.y = prevPoint.y; else worldPos.x = prevPoint.x;
      }
      updatedElement.points[updatedElement.points.length - 1] = { ...worldPos };
      const elementsCopy = [...elements]; elementsCopy[index] = updatedElement; setElements(elementsCopy);
    } else if (action === 'drawing_dimension') {
      const index = elements.length - 1; const updatedElement = { ...elements[index] };
      if (drawingStep === 1) {
        updatedElement.x2 = worldPos.x; updatedElement.y2 = worldPos.y;
        if (e.shiftKey) { const dx = Math.abs(worldPos.x - updatedElement.x1), dy = Math.abs(worldPos.y - updatedElement.y1); if (dx > dy) updatedElement.y2 = updatedElement.y1; else updatedElement.x2 = updatedElement.x1; }
      } else if (drawingStep === 2) {
        const angle = Math.atan2(updatedElement.y2 - updatedElement.y1, updatedElement.x2 - updatedElement.x1);
        updatedElement.offsetDist = (worldPos.x - updatedElement.x1) * (-Math.sin(angle)) + (worldPos.y - updatedElement.y1) * Math.cos(angle);
      }
      const elementsCopy = [...elements]; elementsCopy[index] = updatedElement; setElements(elementsCopy);
    } else if (action === 'drawing_dimension_radial') {
      const index = elements.length - 1; const elementsCopy = [...elements];
      elementsCopy[index] = { ...elements[index], textX: worldPos.x, textY: worldPos.y }; setElements(elementsCopy);
    } else if (action === 'drawing_arc') {
      const index = elements.length - 1; const updatedElement = { ...elements[index] };
      let angle = Math.atan2(worldPos.y - updatedElement.y, worldPos.x - updatedElement.x); if (angle < 0) angle += 2 * Math.PI;
      if (drawingStep === 1) { updatedElement.r = distance({x: updatedElement.x, y: updatedElement.y}, worldPos); updatedElement.startAngle = angle; updatedElement.endAngle = angle + 2 * Math.PI; } 
      else if (drawingStep === 2) { updatedElement.endAngle = angle; }
      const elementsCopy = [...elements]; elementsCopy[index] = updatedElement; setElements(elementsCopy);
    } else if (action === 'moving' && selectedId) {
      const index = elements.findIndex(el => el.id === selectedId); if (index === -1) return;
      const el = elements[index];
      let refX = 0, refY = 0;
      if (el.x1 !== undefined) { refX = el.x1; refY = el.y1; } else if (el.cx !== undefined) { refX = el.cx; refY = el.cy; } else if (el.x !== undefined) { refX = el.x; refY = el.y; } else if (el.points && el.points.length > 0) { refX = el.points[0].x; refY = el.points[0].y; }
      let targetX = worldPos.x - dragOffset.x, targetY = worldPos.y - dragOffset.y;
      if (snapToGrid && !activeSnap) { targetX = Math.round(targetX / GRID_SIZE) * GRID_SIZE; targetY = Math.round(targetY / GRID_SIZE) * GRID_SIZE; }
      const dx = targetX - refX, dy = targetY - refY;
      const updatedElement = translateElement(el, dx, dy);
      const elementsCopy = [...elements]; elementsCopy[index] = updatedElement; setElements(elementsCopy);
    } else if (action === 'resizing' && selectedId) {
      const index = elements.findIndex(el => el.id === selectedId); if (index === -1) return;
      const el = elements[index]; const updatedElement = { ...el };
      if (snapToGrid && !activeSnap) worldPos = getSnappedPos(worldPos);

      if (el.type === 'image') {
        if (activeGrip === 'img_br') { updatedElement.width = Math.max(10, worldPos.x - el.x); updatedElement.height = Math.max(10, worldPos.y - el.y); } 
        else if (activeGrip === 'img_tr') { updatedElement.width = Math.max(10, worldPos.x - el.x); const newY = Math.min(worldPos.y, el.y + el.height - 10); updatedElement.height = el.y + el.height - newY; updatedElement.y = newY; } 
        else if (activeGrip === 'img_bl') { const newX = Math.min(worldPos.x, el.x + el.width - 10); updatedElement.width = el.x + el.width - newX; updatedElement.x = newX; updatedElement.height = Math.max(10, worldPos.y - el.y); } 
        else if (activeGrip === 'img_tl') { const newX = Math.min(worldPos.x, el.x + el.width - 10); const newY = Math.min(worldPos.y, el.y + el.height - 10); updatedElement.width = el.x + el.width - newX; updatedElement.height = el.y + el.height - newY; updatedElement.x = newX; updatedElement.y = newY; }
      } else if (el.type === 'text' || el.type === 'block') {
        if (activeGrip === 'txt_p' || activeGrip === 'blk_p') { updatedElement.x = worldPos.x; updatedElement.y = worldPos.y; }
      } else if (el.type === 'line') {
        if (activeGrip === 'line_p1') { updatedElement.x1 = worldPos.x; updatedElement.y1 = worldPos.y; } 
        else if (activeGrip === 'line_p2') { updatedElement.x2 = worldPos.x; updatedElement.y2 = worldPos.y; } 
        else if (activeGrip === 'line_c') { const dx = worldPos.x - (el.x1 + el.x2) / 2, dy = worldPos.y - (el.y1 + el.y2) / 2; updatedElement.x1 += dx; updatedElement.y1 += dy; updatedElement.x2 += dx; updatedElement.y2 += dy; }
      } else if (el.type === 'rect') {
        if (activeGrip === 'r_tl') { updatedElement.x1 = worldPos.x; updatedElement.y1 = worldPos.y; } else if (activeGrip === 'r_tr') { updatedElement.x2 = worldPos.x; updatedElement.y1 = worldPos.y; } else if (activeGrip === 'r_bl') { updatedElement.x1 = worldPos.x; updatedElement.y2 = worldPos.y; } else if (activeGrip === 'r_br') { updatedElement.x2 = worldPos.x; updatedElement.y2 = worldPos.y; }
      } else if (el.type === 'circle') {
        if (activeGrip === 'circ_c') { const dx = worldPos.x - el.x1, dy = worldPos.y - el.y1; updatedElement.x1 += dx; updatedElement.y1 += dy; updatedElement.x2 += dx; updatedElement.y2 += dy; } 
        else if (activeGrip === 'circ_r') { updatedElement.x2 = worldPos.x; updatedElement.y2 = worldPos.y; }
      } else if (el.type === 'pencil' || el.type === 'polyline' || el.type === 'hatch') {
        if (activeGrip.startsWith('pt_')) { const ptIdx = parseInt(activeGrip.split('_')[1]); updatedElement.points[ptIdx] = { x: worldPos.x, y: worldPos.y }; }
      } else if (el.type === 'arc') {
        if (activeGrip === 'arc_c') { updatedElement.x = worldPos.x; updatedElement.y = worldPos.y; } 
        else if (activeGrip === 'arc_s') { updatedElement.r = distance({x: el.x, y: el.y}, worldPos); let angle = Math.atan2(worldPos.y - el.y, worldPos.x - el.x); if (angle < 0) angle += 2 * Math.PI; updatedElement.startAngle = angle; } 
        else if (activeGrip === 'arc_e') { updatedElement.r = distance({x: el.x, y: el.y}, worldPos); let angle = Math.atan2(worldPos.y - el.y, worldPos.x - el.x); if (angle < 0) angle += 2 * Math.PI; updatedElement.endAngle = angle; }
      } else if (el.type === 'dimension') {
        if (activeGrip === 'dim_p1') { updatedElement.x1 = worldPos.x; updatedElement.y1 = worldPos.y; } 
        else if (activeGrip === 'dim_p2') { updatedElement.x2 = worldPos.x; updatedElement.y2 = worldPos.y; } 
        else if (activeGrip === 'dim_off') { const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1); updatedElement.offsetDist = (worldPos.x - el.x1) * (-Math.sin(angle)) + (worldPos.y - el.y1) * Math.cos(angle); }
      } else if (el.type === 'dimension_radial') {
        if (activeGrip === 'dimr_c') { updatedElement.cx = worldPos.x; updatedElement.cy = worldPos.y; } else if (activeGrip === 'dimr_t') { updatedElement.textX = worldPos.x; updatedElement.textY = worldPos.y; }
      }

      const elementsCopy = [...elements]; elementsCopy[index] = updatedElement; setElements(elementsCopy);
    }
  };

  const handleMouseUp = () => {
    if (action === 'drawing' || action === 'moving' || action === 'resizing') updateHistory(elements);
    
    if (action === 'selecting_print') {
        handlePrintArea(printStartPos, printCurrentPos);
        setAction('none');
        setTool('select');
        return;
    }

    if (action !== 'drawing_poly' && action !== 'drawing_hatch' && action !== 'drawing_arc' && action !== 'drawing_dimension' && action !== 'drawing_dimension_radial') {
      setAction('none'); setActiveGrip(null);
    }
  };

  const handleContextMenu = useCallback((e) => {
    e.preventDefault(); setShowProperties(false);
    if (action === 'drawing_poly' || action === 'drawing_hatch') {
      const index = elements.length - 1; const el = elements[index]; const finalPointsCount = el.points.length - 1;
      if ((el.type === 'polyline' && finalPointsCount >= 2) || (el.type === 'hatch' && finalPointsCount >= 3)) {
        updateHistory([...elements.slice(0, -1), { ...el, points: el.points.slice(0, -1) }]);
      } else { setElements(elements.slice(0, -1)); }
      setAction('none'); setDrawingStep(0); return;
    } else if (action === 'drawing_arc' || action === 'drawing_dimension' || action === 'drawing_dimension_radial') {
      setElements(elements.slice(0, -1)); setAction('none'); setDrawingStep(0); return;
    } else if (action === 'selecting_print') {
      setAction('none'); setTool('select'); return;
    }

    const screenPos = getMousePosOnCanvas(e);
    const worldPos = screenToWorld(screenPos.x, screenPos.y);

    let found = null;
    for (let i = elements.length - 1; i >= 0; i--) {
      const elLayer = layers.find(l => l.id === (elements[i].layerId || 'layer1')); if (elLayer && !elLayer.visible) continue;
      if (isPointNearElement(worldPos.x, worldPos.y, elements[i], camera.zoom)) { found = elements[i]; break; }
    }

    if (found) { setSelectedId(found.id); setPropertiesPos({ x: e.clientX, y: e.clientY }); setShowProperties(true); }
  }, [action, elements, layers, camera, updateHistory]);

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomSensitivity = 0.001; const delta = -e.deltaY * zoomSensitivity;
    const newZoom = Math.max(0.1, Math.min(camera.zoom * (1 + delta), 10));
    const screenPos = getMousePosOnCanvas(e); const worldPos = screenToWorld(screenPos.x, screenPos.y);
    setCamera({ x: screenPos.x - worldPos.x * newZoom, y: screenPos.y - worldPos.y * newZoom, zoom: newZoom });
  };

  const deleteSelected = useCallback(() => {
    if (selectedId) {
      updateHistory(elements.filter(el => el.id !== selectedId)); setSelectedId(null);
    }
  }, [elements, selectedId, updateHistory]);

  const duplicateSelected = useCallback(() => {
    if (selectedId) {
      const elToCopy = elements.find(el => el.id === selectedId);
      if (elToCopy) {
        const newEl = translateElement(elToCopy, GRID_SIZE, GRID_SIZE);
        newEl.id = Date.now();
        updateHistory([...elements, newEl]);
        setSelectedId(newEl.id);
      }
    }
  }, [elements, selectedId, updateHistory]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'select') return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); duplicateSelected(); } 
      else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); } 
      else if (e.key === 'Enter' && tool === 'make_block') {
         if (draftSelection.length > 0) {
            setShowBlockPrompt(true);
         }
      } else if (e.key === 'Escape') {
        if (action === 'drawing_poly' || action === 'drawing_hatch' || action === 'drawing_arc' || action === 'drawing_dimension' || action === 'drawing_dimension_radial' || action === 'drawing') setElements(elements.slice(0, -1)); 
        else if (action === 'resizing' || action === 'moving') setElements(history[historyStep]); 
        setAction('none'); setActiveGrip(null); setDrawingStep(0); setSelectedId(null); setDraftSelection([]);
      } else if (e.key === 'Enter' && (action === 'drawing_poly' || action === 'drawing_hatch')) {
        const el = elements[elements.length - 1]; const finalPointsCount = el.points.length - 1;
        if ((el.type === 'polyline' && finalPointsCount >= 2) || (el.type === 'hatch' && finalPointsCount >= 3)) updateHistory([...elements.slice(0, -1), { ...el, points: el.points.slice(0, -1) }]);
        else setElements(elements.slice(0, -1));
        setAction('none'); setDrawingStep(0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelected, duplicateSelected, undo, redo, action, drawingStep, elements, updateHistory, historyStep, history, tool, draftSelection, activeBlockName]);

  const clearCanvas = () => { updateHistory([]); setSelectedId(null); setAction('none'); setDrawingStep(0); setDraftSelection([]); };

  const handleColorChange = (newColor) => {
    setColor(newColor);
    if (selectedId) updateHistory(elements.map(el => el.id === selectedId ? { ...el, color: newColor, byLayer: false } : el));
  };

  // --- RENDERIZADO DEL CANVAS ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr; canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${dimensions.width}px`; canvas.style.height = `${dimensions.height}px`;

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    if (showGrid) {
      const startX = Math.floor((-camera.x / camera.zoom) / GRID_SIZE) * GRID_SIZE;
      const endX = startX + (dimensions.width / camera.zoom) + GRID_SIZE;
      const startY = Math.floor((-camera.y / camera.zoom) / GRID_SIZE) * GRID_SIZE;
      const endY = startY + (dimensions.height / camera.zoom) + GRID_SIZE;

      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1 / camera.zoom; 
      ctx.beginPath();
      for (let x = startX; x <= endX; x += GRID_SIZE) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
      for (let y = startY; y <= endY; y += GRID_SIZE) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
      ctx.stroke();

      ctx.strokeStyle = '#475569'; ctx.lineWidth = 2 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(0, startY); ctx.lineTo(0, endY);
      ctx.moveTo(startX, 0); ctx.lineTo(endX, 0);
      ctx.stroke();
    }

    elements.forEach(element => {
      const elLayer = layers.find(l => l.id === (element.layerId || 'layer1'));
      if (elLayer && !elLayer.visible) return;

      if (element.type === 'block') {
         const def = blockDefs[element.blockName];
         if (def) {
             ctx.save();
             ctx.translate(element.x, element.y);
             ctx.rotate((element.rotation || 0) * Math.PI / 180);
             const s = element.scale || 1;
             ctx.scale(s, s);
             def.elements.forEach(innerEl => drawShape(innerEl, ctx, false, false, camera.zoom * s, false));
             if (element.id === selectedId) {
                 ctx.fillStyle = '#3b82f6'; const gs = 8 / (camera.zoom * s);
                 ctx.fillRect(-gs/2, -gs/2, gs, gs);
             } else if (draftSelection.includes(element.id)) {
                 ctx.fillStyle = '#d946ef'; const gs = 8 / (camera.zoom * s);
                 ctx.fillRect(-gs/2, -gs/2, gs, gs);
             }
             ctx.restore();
         }
      } else {
         drawShape(element, ctx, element.id === selectedId, draftSelection.includes(element.id), camera.zoom, false);

         // Puntos de control regulares
         if (element.id === selectedId) {
           ctx.fillStyle = '#3b82f6'; const gs = 8 / camera.zoom;
           const drawGrip = (gx, gy) => ctx.fillRect(gx - gs/2, gy - gs/2, gs, gs);
           if (element.type === 'line') { drawGrip(element.x1, element.y1); drawGrip(element.x2, element.y2); drawGrip((element.x1+element.x2)/2, (element.y1+element.y2)/2); }
           else if (element.type === 'rect') { drawGrip(element.x1, element.y1); drawGrip(element.x2, element.y1); drawGrip(element.x1, element.y2); drawGrip(element.x2, element.y2); } 
           else if (element.type === 'circle') { drawGrip(element.x1, element.y1); const r = distance({x:element.x1,y:element.y1}, {x:element.x2,y:element.y2}); drawGrip(element.x1+r, element.y1); drawGrip(element.x1-r, element.y1); drawGrip(element.x1, element.y1+r); drawGrip(element.x1, element.y1-r); } 
           else if (element.type === 'pencil' || element.type === 'polyline' || element.type === 'hatch') element.points.forEach(p => drawGrip(p.x, p.y));
           else if (element.type === 'arc') { drawGrip(element.x, element.y); drawGrip(element.x+element.r*Math.cos(element.startAngle), element.y+element.r*Math.sin(element.startAngle)); drawGrip(element.x+element.r*Math.cos(element.endAngle), element.y+element.r*Math.sin(element.endAngle)); } 
           else if (element.type === 'dimension') { drawGrip(element.x1, element.y1); drawGrip(element.x2, element.y2); const ang = Math.atan2(element.y2-element.y1, element.x2-element.x1); drawGrip((element.x1+element.x2)/2-Math.sin(ang)*element.offsetDist, (element.y1+element.y2)/2+Math.cos(ang)*element.offsetDist); } 
           else if (element.type === 'dimension_radial') { drawGrip(element.cx, element.cy); drawGrip(element.textX, element.textY); } 
           else if (element.type === 'text') { drawGrip(element.x, element.y); } 
           else if (element.type === 'image') { drawGrip(element.x, element.y); drawGrip(element.x+element.width, element.y); drawGrip(element.x, element.y+element.height); drawGrip(element.x+element.width, element.y+element.height); }
         }
      }
    });

    // Renderizar caja de selección de impresión
    if (action === 'selecting_print' && printStartPos && printCurrentPos) {
       ctx.save();
       ctx.strokeStyle = '#3b82f6';
       ctx.lineWidth = 2 / camera.zoom;
       ctx.setLineDash([8 / camera.zoom, 8 / camera.zoom]);
       ctx.strokeRect(printStartPos.x, printStartPos.y, printCurrentPos.x - printStartPos.x, printCurrentPos.y - printStartPos.y);
       ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
       ctx.fillRect(printStartPos.x, printStartPos.y, printCurrentPos.x - printStartPos.x, printCurrentPos.y - printStartPos.y);
       ctx.restore();
    }

    // Renderizar indicador visual OSNAP
    if (osnapEnabled && activeSnap) {
        ctx.save(); ctx.translate(activeSnap.x, activeSnap.y);
        const s = 12 / camera.zoom; ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2 / camera.zoom; ctx.beginPath();
        if (activeSnap.type === 'endpoint') ctx.rect(-s/2, -s/2, s, s);
        else if (activeSnap.type === 'midpoint') { ctx.moveTo(0, -s/2); ctx.lineTo(s/2, s/2); ctx.lineTo(-s/2, s/2); ctx.closePath(); } 
        else if (activeSnap.type === 'center') ctx.arc(0, 0, s/2, 0, Math.PI*2);
        else if (activeSnap.type === 'intersection') { ctx.moveTo(-s/2, -s/2); ctx.lineTo(s/2, s/2); ctx.moveTo(s/2, -s/2); ctx.lineTo(-s/2, s/2); } 
        else if (activeSnap.type === 'perpendicular') { ctx.moveTo(-s/2, s/2); ctx.lineTo(0, s/2); ctx.lineTo(0, 0); }
        ctx.stroke(); ctx.restore();
    }

    ctx.restore();
  }, [elements, camera, dimensions, selectedId, draftSelection, blockDefs, osnapEnabled, activeSnap, showGrid, action, printStartPos, printCurrentPos, drawShape]);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const ToolButton = ({ icon: Icon, id, label }) => (
    <button
      onClick={() => { setTool(id); setSelectedId(null); }}
      className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${
        tool === id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
      title={label}
    >
      <Icon size={20} />
      <span className="text-[10px] hidden md:block">{label}</span>
    </button>
  );

  return (
    <div className="w-full h-screen overflow-hidden bg-gray-900 text-white select-none flex flex-col font-sans">
      
      <div className="h-16 bg-gray-950 border-b border-gray-800 flex items-center px-4 gap-4 z-10 shadow-lg shrink-0 overflow-x-auto">
        <div className="text-blue-500 font-bold text-xl mr-4 flex items-center gap-2">
          <Square className="rotate-45" /> MiniCAD v1.0.0
        </div>
        
        <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
          <ToolButton icon={MousePointer2} id="select" label="Select" />
          <ToolButton icon={Hand} id="pan" label="Mover" />
          <ToolButton icon={CopyPlus} id="copy_tool" label="Copiar" />
        </div>

        <div className="w-px h-8 bg-gray-800 mx-1"></div>

        <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
          <ToolButton icon={Minus} id="line" label="Línea" />
          <ToolButton icon={Activity} id="polyline" label="Polilínea" />
          <ToolButton icon={Square} id="rect" label="Rect" />
          <ToolButton icon={Circle} id="circle" label="Círculo" />
          <ToolButton icon={RotateCw} id="arc" label="Arco" />
          <ToolButton icon={Hash} id="hatch" label="Sombreado" />
          <ToolButton icon={Type} id="text" label="Texto" />
          <ToolButton icon={Pencil} id="pencil" label="Libre" />
          <div className="w-px h-6 bg-gray-800 my-auto mx-1"></div>
          <ToolButton icon={Ruler} id="dimension" label="Cota Lin." />
          <ToolButton icon={CircleDot} id="dimension_radial" label="Cota Rad." />
        </div>

        <div className="w-px h-8 bg-gray-800 mx-1"></div>

        <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
          <ToolButton icon={Scissors} id="trim" label="Recortar" />
          <ToolButton icon={Maximize} id="extend" label="Alargar" />
        </div>

        <div className="w-px h-8 bg-gray-800 mx-1"></div>

        <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current.click()}
            className="p-2 rounded-lg flex flex-col items-center gap-1 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            title="Insertar Imagen"
          >
            <ImageIcon size={20} />
            <span className="text-[10px] hidden md:block">Imagen</span>
          </button>
        </div>

        <div className="w-px h-8 bg-gray-800 mx-1"></div>

        <div className="flex items-center gap-1 bg-gray-900 p-1 rounded-lg border border-gray-800">
          <ToolButton icon={Package} id="make_block" label="Crear Blq." />
          <div className="w-px h-6 bg-gray-800 my-auto mx-1"></div>
          <ToolButton icon={PackagePlus} id="insert_block" label="Ins. Blq." />
          {Object.keys(blockDefs).length > 0 && (
            <select 
               className="bg-gray-800 text-white text-[10px] w-20 outline-none rounded my-1 mr-1 p-1 cursor-pointer"
               value={activeBlockName} 
               onChange={e => { setActiveBlockName(e.target.value); setTool('insert_block'); setSelectedId(null); }}
            >
               <option value="">Bloques...</option>
               {Object.keys(blockDefs).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
        </div>

        <div className="w-px h-8 bg-gray-800 mx-1"></div>

        <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
          <ToolButton icon={Printer} id="print" label="Imp. Vista" />
        </div>

        <div className="w-px h-8 bg-gray-800 mx-1"></div>

        <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
          <button onClick={() => setSnapToGrid(!snapToGrid)} className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${snapToGrid ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`} title="Ajustar a Rejilla (Snap)">
            <Magnet size={20} /><span className="text-[10px] hidden md:block">Rejilla</span>
          </button>
          <button onClick={() => setOsnapEnabled(!osnapEnabled)} className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-colors ${osnapEnabled ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`} title="Referencia a Objetos (Osnap)">
            <Crosshair size={20} /><span className="text-[10px] hidden md:block">Osnap</span>
          </button>
        </div>

        <div className="w-px h-8 bg-gray-800 mx-1"></div>

        <div className="flex items-center gap-3 bg-gray-900 p-2 rounded-lg border border-gray-800">
          <button onClick={() => setShowLayerPanel(!showLayerPanel)} className={`p-1.5 rounded flex items-center gap-1 transition-colors ${showLayerPanel ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`} title="Gestor de Capas">
            <LayersIcon size={18} />
          </button>
          <div className="w-px h-4 bg-gray-700"></div>
          <input type="color" value={color} onChange={(e) => handleColorChange(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0" title="Color"/>
          <input type="range" min="1" max="10" value={lineWidth} onChange={(e) => setLineWidth(parseInt(e.target.value))} className="w-24 accent-blue-500" title="Grosor de línea"/>
        </div>

        <div className="flex-grow"></div>

        <div className="flex gap-2 items-center">
          <button onClick={undo} disabled={historyStep === 0} className="p-2 text-gray-400 hover:text-white disabled:opacity-30 transition"><Undo size={20} /></button>
          <button onClick={redo} disabled={historyStep === history.length - 1} className="p-2 text-gray-400 hover:text-white disabled:opacity-30 transition"><Redo size={20} /></button>
          <div className="w-px h-6 bg-gray-800 mx-1"></div>
          <button onClick={deleteSelected} disabled={!selectedId} className="p-2 text-red-400 hover:bg-red-500/20 rounded disabled:opacity-30 transition"><Trash2 size={20} /></button>
          <button onClick={duplicateSelected} disabled={!selectedId} className="p-2 text-blue-400 hover:bg-blue-500/20 rounded disabled:opacity-30 transition"><Copy size={20} /></button>
          <button onClick={clearCanvas} className="p-2 text-orange-400 hover:bg-orange-500/20 rounded transition">Limpiar</button>
          <div className="w-px h-6 bg-gray-800 mx-1"></div>

          {/* Importadores ocultos */}
          <input type="file" accept=".svg" ref={fileInputSvgRef} onChange={handleSvgImport} className="hidden" />
          <input type="file" accept=".dxf" ref={fileInputDxfRef} onChange={handleDxfImport} className="hidden" />
          <input type="file" accept=".json" ref={fileInputJsonRef} onChange={handleJSONImport} className="hidden" />

          {/* Botones de Importación/Exportación */}
          <div className="flex flex-col gap-1 items-stretch text-[10px]">
            <div className="flex gap-1">
              <span className="text-gray-500 w-8 text-right self-center">IMP:</span>
              <button onClick={() => fileInputJsonRef.current.click()} className="px-2 py-0.5 bg-gray-800 text-blue-400 hover:bg-blue-500/20 rounded border border-gray-700 transition" title="Restaurar Proyecto (JSON)">JSON</button>
              <button onClick={() => fileInputSvgRef.current.click()} className="px-2 py-0.5 bg-gray-800 text-blue-400 hover:bg-blue-500/20 rounded border border-gray-700 transition" title="Importar Vectores (SVG)">SVG</button>
              <button onClick={() => fileInputDxfRef.current.click()} className="px-2 py-0.5 bg-gray-800 text-yellow-500 hover:bg-yellow-500/20 rounded border border-gray-700 transition" title="Importar Archivo AutoCAD (DXF)">DXF</button>
            </div>
            <div className="flex gap-1">
               <span className="text-gray-500 w-8 text-right self-center">EXP:</span>
               <button onClick={exportToJSON} className="px-2 py-0.5 bg-gray-800 text-blue-400 hover:bg-blue-500/20 rounded border border-gray-700 transition" title="Guardar Proyecto (JSON)">JSON</button>
               <button onClick={exportToPNG} className="px-2 py-0.5 bg-gray-800 text-green-400 hover:bg-green-500/20 rounded border border-gray-700 transition" title="Exportar como Imagen">PNG</button>
               <button onClick={exportToSVG} className="px-2 py-0.5 bg-gray-800 text-purple-400 hover:bg-purple-500/20 rounded border border-gray-700 transition" title="Exportar Vectores">SVG</button>
               <button onClick={exportToDXF} className="px-2 py-0.5 bg-gray-800 text-yellow-500 hover:bg-yellow-500/20 rounded border border-gray-700 transition flex items-center"><FileCode2 size={10} className="mr-1"/> DXF</button>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex-grow bg-[#111827] overflow-hidden cursor-crosshair"
           style={{ cursor: tool === 'pan' ? (action === 'panning' ? 'grabbing' : 'grab') : (tool === 'select' || tool === 'copy_tool') ? (action === 'resizing' || action === 'moving' ? 'move' : 'default') : 'crosshair' }}>
        <canvas
          ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel} onContextMenu={handleContextMenu}
          className="absolute top-0 left-0"
        />

        <div className="absolute bottom-4 right-4 bg-gray-900/80 backdrop-blur border border-gray-800 px-4 py-2 rounded-lg text-xs text-green-400 font-mono flex items-center gap-6 pointer-events-none">
          <div className="flex items-center gap-2"><span className="text-gray-500">X:</span> {mousePos.x.toFixed(2)}<span className="text-gray-500 ml-2">Y:</span> {mousePos.y.toFixed(2)}</div>
          <div className="w-px h-4 bg-gray-700"></div>
          <div className="flex items-center gap-2 text-blue-400"><ZoomIn size={14} /> {(camera.zoom * 100).toFixed(0)}%</div>
        </div>
      
        <div className="absolute bottom-4 left-4 bg-gray-900/80 backdrop-blur border border-gray-800 px-3 py-2 rounded-lg text-xs text-gray-400 pointer-events-none hidden md:block">
          {tool === 'make_block' ? (
             <span className="text-magenta-400 font-bold">Haz clic en los objetos a agrupar. Pulsa ENTER para terminar.</span>
          ) : tool === 'print' ? (
             <span className="text-blue-400 font-bold">Arrastra un rectángulo para seleccionar el área de impresión.</span>
          ) : tool === 'trim' ? (
             <span className="text-yellow-400 font-bold">Haz clic en el extremo de una línea para recortarla hasta la intersección más cercana.</span>
          ) : tool === 'extend' ? (
             <span className="text-yellow-400 font-bold">Haz clic en el extremo de una línea para alargarla hasta la intersección más cercana.</span>
          ) : (
             <>
               <span className="text-white">Shift:</span> M. Ortogonal &nbsp;|&nbsp;
               <span className="text-white">Clic Der / Enter:</span> Fin Pol./Sombreado &nbsp;|&nbsp;
               <span className="text-white">Rueda:</span> Zoom &nbsp;|&nbsp; 
               <span className="text-white">Clic Central:</span> Mover &nbsp;|&nbsp;
               <span className="text-white">Esc:</span> Cancelar
             </>
          )}
        </div>

        {showLayerPanel && (
          <div className="absolute top-4 right-4 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-20 flex flex-col pointer-events-auto">
            <div className="p-3 bg-gray-950 border-b border-gray-800 flex justify-between items-center rounded-t-lg">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-200"><LayersIcon size={16} className="text-blue-500" /> Capas</div>
              <button onClick={() => { const newId = `layer${Date.now()}`; const randomColor = `hsl(${Math.floor(Math.random() * 360)}, 100%, 70%)`; setLayers([...layers, { id: newId, name: `Capa ${layers.length + 1}`, color: randomColor, visible: true }]); setActiveLayerId(newId); setColor(randomColor); }} className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition" title="Nueva Capa"><Plus size={16} /></button>
            </div>
            <div className="max-h-64 overflow-y-auto p-2 flex flex-col gap-1">
              {layers.map(layer => (
                <div key={layer.id} className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${activeLayerId === layer.id ? 'bg-blue-600/20 border border-blue-500/50' : 'hover:bg-gray-800 border border-transparent'}`} onClick={() => { setActiveLayerId(layer.id); setColor(layer.color); setSelectedId(null); }}>
                  <button onClick={(e) => { e.stopPropagation(); setLayers(layers.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l)); setSelectedId(null); }} className={`p-1 rounded ${layer.visible ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-400'}`}>{layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                  <input type="color" value={layer.color} onClick={(e) => e.stopPropagation()} onChange={(e) => { const newCol = e.target.value; setLayers(layers.map(l => l.id === layer.id ? { ...l, color: newCol } : l)); if (activeLayerId === layer.id) setColor(newCol); }} className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0 flex-shrink-0" />
                  <input 
                    type="text" 
                    value={layer.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setLayers(layers.map(l => l.id === layer.id ? { ...l, name: e.target.value } : l))}
                    className={`text-sm flex-grow min-w-0 bg-transparent outline-none border border-transparent focus:border-gray-600 focus:bg-gray-800 px-1 rounded transition-all ${activeLayerId === layer.id ? 'text-blue-400 font-medium' : 'text-gray-300'}`}
                    title="Haz clic para renombrar la capa"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {showProperties && selectedId && (() => {
          const el = elements.find(e => e.id === selectedId);
          if (!el) return null;
          const updateEl = (updates) => { setElements(els => els.map(e => e.id === selectedId ? { ...e, ...updates } : e)); };
          const commitChanges = () => updateHistory(elements);
          const commitDirectChange = (updates) => { const newEls = elements.map(e => e.id === selectedId ? { ...e, ...updates } : e); updateHistory(newEls); };

          const menuStyle = { left: Math.min(propertiesPos.x, dimensions.width - 250), top: Math.min(propertiesPos.y, dimensions.height - 350) };

          return (
            <div style={menuStyle} className="absolute bg-gray-900 border border-gray-700 shadow-xl rounded-lg p-3 z-50 w-64 flex flex-col pointer-events-auto">
              <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-2">
                <span className="font-bold text-blue-400 capitalize text-sm">Propiedades: {el.type === 'dimension_radial' ? 'cota rad.' : el.type === 'dimension' ? 'cota lin.' : el.type}</span>
                <button onClick={() => setShowProperties(false)} className="text-gray-400 hover:text-white">&times;</button>
              </div>
              <div className="overflow-y-auto max-h-64 pr-1">

                {/* PROPIEDADES GLOBALES (Capa y Color) */}
                <div className="mb-2 pb-2 border-b border-gray-700">
                  <PropSelectInput 
                    label="Capa" 
                    value={el.layerId || 'layer1'} 
                    options={layers.map(l => ({ value: l.id, label: l.name }))}
                    onChange={v => commitDirectChange({layerId: v})} 
                  />
                  <PropCheckbox 
                    label="Color por Capa" 
                    checked={el.byLayer !== false} 
                    onChange={v => commitDirectChange({byLayer: v})} 
                  />
                  <PropColor 
                    label="Color Objeto" 
                    value={el.byLayer !== false ? (layers.find(l=>l.id===(el.layerId||'layer1'))?.color || el.color) : el.color} 
                    disabled={el.byLayer !== false} 
                    onChange={v => commitDirectChange({color: v, byLayer: false})} 
                  />
                </div>

                {el.type === 'line' && <>
                  <PropInput label="X Inicio" value={el.x1} onChange={v => updateEl({x1: v})} onBlur={commitChanges} />
                  <PropInput label="Y Inicio" value={el.y1} onChange={v => updateEl({y1: v})} onBlur={commitChanges} />
                  <PropInput label="X Fin" value={el.x2} onChange={v => updateEl({x2: v})} onBlur={commitChanges} />
                  <PropInput label="Y Fin" value={el.y2} onChange={v => updateEl({y2: v})} onBlur={commitChanges} />
                </>}
                {el.type === 'rect' && <>
                  <PropInput label="X1 (Izq)" value={el.x1} onChange={v => updateEl({x1: v})} onBlur={commitChanges} />
                  <PropInput label="Y1 (Arr)" value={el.y1} onChange={v => updateEl({y1: v})} onBlur={commitChanges} />
                  <PropInput label="X2 (Der)" value={el.x2} onChange={v => updateEl({x2: v})} onBlur={commitChanges} />
                  <PropInput label="Y2 (Aba)" value={el.y2} onChange={v => updateEl({y2: v})} onBlur={commitChanges} />
                </>}
                {el.type === 'circle' && (() => {
                  const r = distance({x: el.x1, y: el.y1}, {x: el.x2, y: el.y2});
                  return <>
                    <PropInput label="Centro X" value={el.x1} onChange={v => { const dx=el.x2-el.x1; updateEl({x1: v, x2: v+dx}); }} onBlur={commitChanges} />
                    <PropInput label="Centro Y" value={el.y1} onChange={v => { const dy=el.y2-el.y1; updateEl({y1: v, y2: v+dy}); }} onBlur={commitChanges} />
                    <PropInput label="Radio" value={r} onChange={v => updateEl({x2: el.x1 + v, y2: el.y1})} onBlur={commitChanges} />
                    <PropInput label="Diámetro" value={r * 2} onChange={v => updateEl({x2: el.x1 + v/2, y2: el.y1})} onBlur={commitChanges} />
                  </>
                })()}
                {el.type === 'arc' && <>
                  <PropInput label="Centro X" value={el.x} onChange={v => updateEl({x: v})} onBlur={commitChanges} />
                  <PropInput label="Centro Y" value={el.y} onChange={v => updateEl({y: v})} onBlur={commitChanges} />
                  <PropInput label="Radio" value={el.r} onChange={v => updateEl({r: v})} onBlur={commitChanges} />
                  <PropInput label="Ángulo Inicio" value={el.startAngle * 180 / Math.PI} onChange={v => updateEl({startAngle: v * Math.PI / 180})} onBlur={commitChanges} />
                  <PropInput label="Ángulo Fin" value={el.endAngle * 180 / Math.PI} onChange={v => updateEl({endAngle: v * Math.PI / 180})} onBlur={commitChanges} />
                </>}
                {el.type === 'image' && <>
                  <PropInput label="X" value={el.x} onChange={v => updateEl({x: v})} onBlur={commitChanges} />
                  <PropInput label="Y" value={el.y} onChange={v => updateEl({y: v})} onBlur={commitChanges} />
                  <PropInput label="Ancho" value={el.width} onChange={v => updateEl({width: v})} onBlur={commitChanges} />
                  <PropInput label="Alto" value={el.height} onChange={v => updateEl({height: v})} onBlur={commitChanges} />
                </>}
                {el.type === 'text' && <>
                  <PropTextInput label="Texto" value={el.text} onChange={v => updateEl({text: v})} onBlur={commitChanges} />
                  <PropInput label="Posición X" value={el.x} onChange={v => updateEl({x: v})} onBlur={commitChanges} />
                  <PropInput label="Posición Y" value={el.y} onChange={v => updateEl({y: v})} onBlur={commitChanges} />
                  <PropInput label="Tamaño Font" value={el.fontSize} onChange={v => updateEl({fontSize: v})} onBlur={commitChanges} />
                  <PropInput label="Inclinación (º)" value={el.rotation || 0} onChange={v => updateEl({rotation: v})} onBlur={commitChanges} />
                  <PropSelectInput label="Tipo Letra" value={el.fontFamily || 'Arial'} options={[ { value: 'Arial', label: 'Arial' }, { value: 'Helvetica', label: 'Helvetica' }, { value: 'Times New Roman', label: 'Times New Roman' }, { value: 'Courier New', label: 'Courier New' }, { value: 'Verdana', label: 'Verdana' }, { value: 'Georgia', label: 'Georgia' }, { value: 'Palatino', label: 'Palatino' }, { value: 'Garamond', label: 'Garamond' }, { value: 'Bookman', label: 'Bookman' }, { value: 'Comic Sans MS', label: 'Comic Sans MS' }, { value: 'Trebuchet MS', label: 'Trebuchet MS' }, { value: 'Arial Black', label: 'Arial Black' }, { value: 'Impact', label: 'Impact' }, { value: 'monospace', label: 'Monospace (Genérica)' }, { value: 'sans-serif', label: 'Sans-Serif (Genérica)' }, { value: 'serif', label: 'Serif (Genérica)' } ]} onChange={v => commitDirectChange({fontFamily: v})} />
                </>}
                {el.type === 'block' && <>
                  <div className="text-gray-400 text-xs mb-2 mt-1 px-1 bg-gray-800 rounded py-1">Nombre: <span className="text-white font-bold">{el.blockName}</span></div>
                  <PropInput label="Posición X" value={el.x} onChange={v => updateEl({x: v})} onBlur={commitChanges} />
                  <PropInput label="Posición Y" value={el.y} onChange={v => updateEl({y: v})} onBlur={commitChanges} />
                  <PropInput label="Escala" value={el.scale || 1} onChange={v => updateEl({scale: v})} onBlur={commitChanges} />
                  <PropInput label="Rotación (º)" value={el.rotation || 0} onChange={v => updateEl({rotation: v})} onBlur={commitChanges} />
                </>}
                {el.type === 'dimension' && <>
                  <PropInput label="X Inicio" value={el.x1} onChange={v => updateEl({x1: v})} onBlur={commitChanges} />
                  <PropInput label="Y Inicio" value={el.y1} onChange={v => updateEl({y1: v})} onBlur={commitChanges} />
                  <PropInput label="X Fin" value={el.x2} onChange={v => updateEl({x2: v})} onBlur={commitChanges} />
                  <PropInput label="Y Fin" value={el.y2} onChange={v => updateEl({y2: v})} onBlur={commitChanges} />
                  <PropInput label="Desplaz." value={el.offsetDist} onChange={v => updateEl({offsetDist: v})} onBlur={commitChanges} />
                </>}
                {el.type === 'dimension_radial' && <>
                  <PropInput label="Centro X" value={el.cx} onChange={v => updateEl({cx: v})} onBlur={commitChanges} />
                  <PropInput label="Centro Y" value={el.cy} onChange={v => updateEl({cy: v})} onBlur={commitChanges} />
                  <PropInput label="Radio" value={el.r} onChange={v => updateEl({r: v})} onBlur={commitChanges} />
                  <PropInput label="Texto X" value={el.textX} onChange={v => updateEl({textX: v})} onBlur={commitChanges} />
                  <PropInput label="Texto Y" value={el.textY} onChange={v => updateEl({textY: v})} onBlur={commitChanges} />
                </>}
                {(el.type === 'pencil' || el.type === 'polyline') && <div className="text-gray-400 text-xs mb-2 mt-1 px-1 bg-gray-800 rounded py-1">Nº Puntos (Vértices): {el.points.length}</div>}
                {el.type === 'hatch' && <>
                  <PropSelectInput label="Tipo Patrón" value={el.patternType || 'lines'} options={[ { value: 'lines', label: 'Líneas' }, { value: 'cross', label: 'Cuadrícula' }, { value: 'dots', label: 'Puntos' }, { value: 'dashed', label: 'Discontinuas' }, { value: 'concrete', label: 'Hormigón' }, { value: 'earth', label: 'Tierra' } ]} onChange={v => commitDirectChange({patternType: v})} />
                  <PropInput label="Escala Patrón" value={el.patternScale} onChange={v => updateEl({patternScale: v})} onBlur={commitChanges} />
                  <PropInput label="Ángulo Patrón" value={el.patternAngle} onChange={v => updateEl({patternAngle: v})} onBlur={commitChanges} />
                  <div className="text-gray-400 text-xs mb-2 mt-1 px-1 bg-gray-800 rounded py-1">Nº Puntos (Vértices): {el.points.length}</div>
                </>}
              </div>
            </div>
          );
        })()}

        {/* MODAL CREAR BLOQUE */}
        {showBlockPrompt && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-auto">
            <div className="bg-gray-900 border border-gray-700 p-6 rounded-lg shadow-2xl w-80 flex flex-col gap-4">
              <h3 className="text-white font-bold text-lg">Crear Nuevo Bloque</h3>
              <p className="text-gray-400 text-xs">Introduce un nombre para el bloque con los {draftSelection.length} objetos seleccionados:</p>
              <input 
                autoFocus
                type="text" 
                value={newBlockName}
                onChange={(e) => setNewBlockName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateBlock();
                  if (e.key === 'Escape') { setShowBlockPrompt(false); setNewBlockName(''); }
                }}
                className="bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-blue-500 outline-none w-full"
                placeholder="Nombre del bloque..."
              />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => { setShowBlockPrompt(false); setNewBlockName(''); }} className="px-4 py-2 rounded text-gray-400 hover:bg-gray-800 transition text-sm">Cancelar</button>
                <button onClick={handleCreateBlock} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 transition font-medium text-sm">Crear Bloque</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
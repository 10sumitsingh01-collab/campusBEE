'use client';
import {useEffect,useRef,useState} from 'react';
import {BarcodeSvg} from '@/components/DemoIdCardsSection';
import {playSuccessTing} from '@/lib/audio/scanSounds';
import {students} from './fixtures';

export default function DemoScanner({lookupAttendance,onAttend}: {
  lookupAttendance:(code:string)=>'registered'|'absent'|'checked'; onAttend:(code:string)=>void;
}) {
  const [code,setCode]=useState('');
  const [result,setResult]=useState<{code:string;source:string}|null>(null);
  const [message,setMessage]=useState('');
  const [camera,setCamera]=useState(false);
  const video=useRef<HTMLVideoElement>(null);
  const generation=useRef(0);
  const controls=useRef<{stop:()=>void}|null>(null);
  useEffect(()=>()=>{generation.current++;controls.current?.stop();},[]);
  function stop(){generation.current++;controls.current?.stop();controls.current=null;setCamera(false);}
  function lookup(raw:string,source:string){
    const token=raw.trim();
    setResult({code:token,source});setMessage('');
    if(students.some(s=>s.code===token)) playSuccessTing(false);
  }
  async function start(){
    stop();setMessage('');setResult(null);
    if(!navigator.mediaDevices?.getUserMedia){setMessage('Camera access requires HTTPS or localhost and a supported browser. Enter a card code below.');return;}
    const run=generation.current;
    setCamera(true);
    try{
      const {BrowserMultiFormatReader}=await import('@zxing/browser');
      if(run!==generation.current || !video.current)return;
      const scanner=await new BrowserMultiFormatReader().decodeFromConstraints({video:{facingMode:{ideal:'environment'}}},video.current,(found)=>{
        if(found && run===generation.current){stop();lookup(found.getText(),'Camera');}
      });
      if(run===generation.current)controls.current=scanner;else scanner.stop();
    }catch{if(run===generation.current){stop();setMessage('Camera unavailable. Check camera permission or enter the printed barcode.');}}
  }
  const student=students.find(s=>s.code===result?.code);
  const status=student && lookupAttendance(student.code);
  return <>
    <p>Scan a card from a second screen or printed copy, or enter its code. A successful identification plays a ting.</p>
    <button onClick={camera?stop:start}>{camera?'Stop camera':'Start camera'}</button>
    <video hidden={!camera} ref={video} autoPlay muted playsInline aria-label="Barcode camera preview"/>
    {message && <p role="status">{message}</p>}
    <form onSubmit={e=>{e.preventDefault();stop();lookup(code,'Manual entry');}}><label>College ID barcode<input value={code} onChange={e=>setCode(e.target.value)} placeholder="DEMO-1001" required maxLength={64}/></label><button>Look up ID</button></form>
    {result && <div role="status" className="demo-result"><small>{result.source} · Demo lookup</small>
      {student ? <><h3>{student.name}</h3><p>{student.code} · {student.department} · Year {student.year}</p>
        {status==='registered'?<button onClick={()=>onAttend(student.code)}>Mark attendance</button>:<strong>{status==='checked'?'Already checked in':'No registration for this event'}</strong>}</>:<strong>No matching demo record.</strong>}
    </div>}
    <div className="demo-cards">{students.map(s=><div className="demo-card" key={s.code}><small>Demo college ID</small><h3>{s.name}</h3><BarcodeSvg value={s.code}/><code>{s.code}</code></div>)}</div>
  </>;
}

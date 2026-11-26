'use client';

import {useState} from 'react';

function presentationPreview(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:') return null;
  const slides = url.pathname.match(/^\/presentation\/d\/(e\/[\w-]+|[\w-]+)(?:\/|$)/);
  if (url.hostname === 'docs.google.com' && slides) {
    return {url:'https://docs.google.com/presentation/d/'+slides[1]+'/embed', provider:'Google Slides'};
  }
  if (/\.pptx?$/i.test(url.pathname)) {
    return {url:'https://view.officeapps.live.com/op/embed.aspx?src='+encodeURIComponent(raw),provider:'Microsoft'};
  }
  return null;
}

export default function ProjectMaterials({links,files}:{links:{label:string;url:string}[];files:string[]}) {
  const [preview,setPreview]=useState('');
  const attachments=files.filter(url=>URL.canParse(url) && /^https?:\/\//i.test(url));
  return <section className="my-3 grid gap-2" aria-label="Submission materials">
    <h3 className="font-semibold">Submission materials</h3>
    {links.filter(l=>/^https?:\/\//i.test(l.url)).map((l,i)=><a className="underline" key={i} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}
    {attachments.map((url,i)=>{
      const embed=presentationPreview(url);
      return <div key={i}><a className="underline" href={url} target="_blank" rel="noreferrer">Open presentation / file {i+1}</a>
        {embed && <> <button type="button" className="rounded border px-2 py-1" aria-expanded={preview===url} onClick={()=>setPreview(preview===url?'':url)}>{preview===url?'Close preview':'Preview with '+embed.provider}</button>
          {preview===url && <iframe title={'Presentation '+(i+1)} className="mt-2 aspect-video w-full rounded border" src={embed.url} referrerPolicy="no-referrer" allowFullScreen/>}</>}
      </div>;
    })}
    {!attachments.length && <p>No presentation submitted.</p>}
  </section>;
}

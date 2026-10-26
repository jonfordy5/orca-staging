// Staging-only reusable, public stock search. The authorized public stocks ledger is
// the sole source of selectable tickers: never invent a workspace for an unlisted stock.
import { orcaStagingHref } from './orca-staging-config.js';

const TICKER_PATTERN=/^[A-Z][A-Z0-9.]{0,9}$/;
export const normalizeTicker = value => String(value||'').trim().toUpperCase();
const el=(tag,klass,text)=>{
 const item=document.createElement(tag);
 if(klass)item.className=klass;
 if(text!==undefined)item.textContent=text;
 return item;
};
export async function mountStockSearch({sb,root,activeTicker=''}) {
 if(!sb||!root)return {supported:[],error:'Search cannot initialize.'};
 root.replaceChildren();
 root.classList.add('orca-lookup');
 const form=el('form','orca-lookup-form');
 form.setAttribute('role','search');
 const field=el('div','orca-lookup-field');
 const label=el('label',null,'Search a stock or company');
 const input=el('input');
 const inputId='orca-stock-query-'+(root.id||'global');
 label.htmlFor=inputId;input.id=inputId;
 input.type='search';input.placeholder='RKLB or Rocket Lab';input.autocomplete='off';
 input.maxLength=80;input.spellcheck=false;
 input.setAttribute('aria-label','Search supported stock ticker or company name');
 input.setAttribute('aria-controls',inputId+'-results');
 const go=el('button',null,'Open workspace');go.type='submit';go.disabled=true;
 field.append(label,input);form.append(field,go);root.append(form);
 const status=el('p','orca-lookup-status','Loading supported research tickers…');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const results=el('ul','orca-lookup-results');results.id=inputId+'-results';results.hidden=true;
 root.append(status,results);
 let rows=[],connected=false;
 const urlFor=ticker=>orcaStagingHref('./research-workspace-staging.html',{ticker});
 function matching(){
  const q=input.value.trim().toUpperCase();
  if(!q)return rows.slice(0,8);
  const exact=[],partial=[];
  for(const entry of rows){
   if(entry.ticker===q)exact.push(entry);
   else if(entry.ticker.includes(q)||entry.company_name.toUpperCase().includes(q))partial.push(entry);
  }
  return [...exact,...partial].slice(0,8);
 }
 function showResults(){
  results.replaceChildren();
  const q=input.value.trim();
  if(!connected){status.textContent='Stock lookup is unavailable. Try refreshing the page.';go.disabled=true;results.hidden=true;return;}
  go.disabled=rows.length===0;
  const matches=matching();
  if(q&&matches.length===0){
   status.textContent='No research workspace is registered for “'+q+'” yet. Try a listed ticker below.';
   results.hidden=true;return;
  }
  status.textContent=q
   ?matches.length+' matching registered stock'+(matches.length===1?'':'s')+'. Select one to open its research.'
   :rows.length+' registered stock'+(rows.length===1?'':'s')+' in ORCA staging. More will be added as they are verified.';
  for(const entry of matches){
   const li=el('li');
   const link=el('a');link.href=urlFor(entry.ticker);
   const sym=el('span','orca-lookup-symbol',entry.ticker);
   const name=el('span','orca-lookup-name',entry.company_name);
   link.append(sym,name);li.append(link);results.append(li);
  }
  results.hidden=matches.length===0;
 }
 input.addEventListener('input',showResults);
 input.addEventListener('focus',showResults);
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'){results.hidden=true;return;}
  if(e.key==='ArrowDown'){const first=results.querySelector('a');if(first){e.preventDefault();first.focus();}}
 });
 root.addEventListener('focusout',()=>{
  // Allow link click to follow normally; hide only after focus moves outside.
  queueMicrotask(()=>{if(!root.contains(document.activeElement))results.hidden=true;});
 });
 form.addEventListener('submit',e=>{
  e.preventDefault();
  if(!connected)return;
  const q=input.value.trim().toUpperCase();
  const best=rows.find(row=>row.ticker===q)
    || (matching().length===1?matching()[0]:null);
  if(!best){
   showResults();if(!q)input.focus();
   return;
  }
  window.location.assign(urlFor(best.ticker));
 });
 try {
  const {data,error}=await sb.from('stocks').select('ticker,company_name').order('ticker',{ascending:true}).limit(500);
  if(error)throw error;
  rows=(data||[]).map(row=>({
   ticker:normalizeTicker(row.ticker),
   company_name:String(row.company_name||row.ticker||'')
  })).filter(row=>TICKER_PATTERN.test(row.ticker));
  connected=true;
  if(activeTicker&&rows.some(row=>row.ticker===normalizeTicker(activeTicker))){
   // Keep the search field empty so visitors can immediately enter another stock.
   input.placeholder='Search another stock (e.g., RKLB)';
  }
  showResults();
  // Avoid showing dropdown until the visitor focuses the field.
  results.hidden=true;
  return {supported:rows,error:null};
 }catch(error){
  status.textContent='Unable to load registered stocks. Please refresh and retry.';
  results.hidden=true;go.disabled=true;
  return {supported:[],error:String(error?.message||error)};
 }
}

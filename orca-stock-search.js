// ORCA staging public exchange ticker search; activation is separately authenticated.
import { orcaStagingHref, selectSupabaseConfig } from './orca-staging-config.js';
const TICKER=/^[A-Z][A-Z0-9.]{0,9}$/;
const norm=s=>String(s||'').trim().toUpperCase();
const make=(tag,klass,value)=>{const el=document.createElement(tag);if(klass)el.className=klass;if(value!==undefined)el.textContent=value;return el;};
export async function mountStockSearch({sb,root,activeTicker=''}) {
 if(!root||!sb)return {error:'No search host'};
 root.replaceChildren();root.classList.add('orca-lookup');
 const form=make('form','orca-lookup-form');form.setAttribute('role','search');
 const field=make('div','orca-lookup-field'),label=make('label',null,'Search any US stock or company');
 const input=make('input');input.type='search';input.placeholder='NVDA or NVIDIA';input.autocomplete='off';input.maxLength=70;
 input.id='orca-stock-query-'+(root.id||'global');label.htmlFor=input.id;
 input.setAttribute('aria-controls',input.id+'-results');
 const go=make('button',null,'Open workspace');go.type='submit';go.disabled=true;
 field.append(label,input);form.append(field,go);root.append(form);
 const status=make('p','orca-lookup-status','Search a ticker or company name.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const results=make('ul','orca-lookup-results');results.id=input.id+'-results';results.hidden=true;root.append(status,results);
 const config=await selectSupabaseConfig();
 const endpoint=config.projectUrl+'/functions/v1/orca-stock-discovery';
 const hdr={'apikey':config.publishableKey};
 let rows=[],selected=null,seq=0,timer=null,registered=new Map(),waiting=false;
 const href=ticker=>orcaStagingHref('./research-workspace-staging.html',{ticker});
 const clean=r=>({ticker:norm(r?.ticker),company_name:String(r?.company_name||r?.ticker||'')});
 function candidates(q){const match=rows.filter(r=>r.ticker.includes(q)||r.company_name.toUpperCase().includes(q));
  return match.sort((a,b)=>Number(b.ticker===q)-Number(a.ticker===q)||Number(b.ticker.startsWith(q))-Number(a.ticker.startsWith(q))||a.ticker.localeCompare(b.ticker)).slice(0,8);
 }
 function render(items){results.replaceChildren();for(const item of items){
  const li=make('li'),button=make('button');button.type='button';button.className='orca-stock-result';
  button.append(make('strong','orca-lookup-symbol',item.ticker),make('span','orca-lookup-name',item.company_name));
  button.addEventListener('click',()=>choose(item));li.append(button);results.append(li);
 }results.hidden=!items.length;
 }
 function choose(item){selected=item;input.value=item.ticker;go.disabled=false;render([]);status.textContent=item.company_name+' selected. Open its research workspace.';}
 async function search(q){
  const ticket=++seq;selected=null;go.disabled=true;
  if(!q){render([...registered.values()].slice(0,8));status.textContent='Search a ticker or company name.';return;}
  if(q.length<2){render([]);status.textContent='Type at least two letters.';return;}
  status.textContent='Searching exchange-listed stocks…';
  try{
   const url=new URL(endpoint);url.searchParams.set('q',q);
   const res=await fetch(url.href,{headers:hdr});
   const data=await res.json();if(ticket!==seq)return;
   if(!res.ok)throw Error(data.error||'Lookup unavailable');
   rows=(data.matches||[]).map(clean).filter(x=>TICKER.test(x.ticker));
   const combined=[...rows];for(const x of registered.values())if((x.ticker.includes(q)||x.company_name.toUpperCase().includes(q))&&!combined.some(y=>y.ticker===x.ticker))combined.push(x);
   render(combined.slice(0,8));status.textContent=combined.length?combined.length+' matching stocks. Select one.':'No verified match. Check spelling or ticker.';
   const exact=combined.find(x=>x.ticker===q);if(exact){selected=exact;go.disabled=false;}
  }catch(e){if(ticket!==seq)return;const fallback=[...registered.values()].filter(x=>x.ticker.includes(q)||x.company_name.toUpperCase().includes(q));render(fallback);status.textContent=fallback.length?'Live lookup unavailable. Registered stocks are shown.':'Stock directory unavailable; try again.';const exact=fallback.find(x=>x.ticker===q);if(exact){selected=exact;go.disabled=false;}}
 }
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>search(norm(input.value)),260)});
 input.addEventListener('focus',()=>{if(!input.value.trim())render([...registered.values()].slice(0,8));});
 input.addEventListener('keydown',e=>{if(e.key==='Escape')results.hidden=true;if(e.key==='ArrowDown'){const first=results.querySelector('button');if(first){e.preventDefault();first.focus();}}});
 async function openSelected(){
  if(waiting||!selected)return;waiting=true;go.disabled=true;status.textContent='Opening '+selected.ticker+'…';
  try{
   if(!registered.has(selected.ticker)){
    const {data:{session},error:sessionError}=await sb.auth.getSession();
    if(sessionError||!session?.access_token){status.textContent='Sign in to register a new stock. Existing research remains public.';return;}
    const response=await fetch(endpoint,{method:'POST',headers:{...hdr,'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({ticker:selected.ticker})});
    const outcome=await response.json();
    if(!response.ok)throw Error(outcome.error||'Stock registration unavailable');
   }
   window.location.assign(href(selected.ticker));
  }catch(e){status.textContent=String(e.message||e);waiting=false;go.disabled=false;}
 }
 form.addEventListener('submit',e=>{e.preventDefault();if(!selected){const exact=rows.find(x=>x.ticker===norm(input.value));if(exact)choose(exact);else{status.textContent='Select a verified stock from search results.';return;}}openSelected();});
 try{
  const {data,error}=await sb.from('stocks').select('ticker,company_name').order('ticker',{ascending:true}).limit(500);
  if(error)throw error;registered=new Map((data||[]).map(clean).filter(x=>TICKER.test(x.ticker)).map(x=>[x.ticker,x]));
  status.textContent='Search a company or ticker. '+registered.size+' research workspace'+(registered.size===1?'':'s')+' already registered.';
  return {registered:[...registered.values()]};
 }catch(e){status.textContent='Registered stocks unavailable, but ticker lookup may still work.';return {error:String(e)};}
}

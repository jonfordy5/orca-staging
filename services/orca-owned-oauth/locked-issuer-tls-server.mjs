// ORCA Stage 25 — lock-only HTTPS issuer host with direct TLS.
// This factory never binds automatically, never publishes OAuth routes,
// never enables tokens, and exposes ONLY a loopback listener.
import {createServer} from 'node:https';
import {createPrivateKey,X509Certificate} from 'node:crypto';

const fail=()=>{throw Error('stage25_locked_https_issuer_rejected');};
const responseHeaders=Object.freeze({
  'content-type':'application/json',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'content-security-policy':"default-src 'none'",
  'referrer-policy':'no-referrer',
  'connection':'close'
});
function deny(res,status,reason){
  if(res.headersSent||res.writableEnded)return;
  res.writeHead(status,responseHeaders);
  res.end(JSON.stringify({error:reason}));
}
function issuerHost(issuer){
  if(typeof issuer!=='string')fail();
  try{
    const url=new URL(issuer);
    if(url.protocol!=='https:'||url.origin!==issuer||url.port||
       url.username||url.password||url.search||url.hash||
       url.pathname!=='/'||url.hostname.indexOf('.')<1)fail();
    return url.hostname;
  }catch{fail();}
}
function validateTls(host,certPem,keyPem){
  if(typeof certPem!=='string'||certPem.length<400||
     certPem.length>32768||typeof keyPem!=='string'||
     keyPem.length<100||keyPem.length>16384)fail();
  try{
    const cert=new X509Certificate(certPem);
    const key=createPrivateKey(keyPem);
    if(!cert.checkPrivateKey(key)||
       cert.checkHost(host,{subject:'never'})!==host||
       !Number.isFinite(Date.parse(cert.validFrom))||
       Date.parse(cert.validFrom)>Date.now()||
       Date.parse(cert.validTo)<=Date.now()+14*24*60*60*1000)
      fail();
  }catch{fail();}
}
/**
 * Must receive the strictly locked Stage 21/22 issuer assembly.
 * No Node server or signing key is returned. Only explicit bind to
 * 127.0.0.1 can be requested. A production network/public issuer requires
 * a DIFFERENT reviewed module and change approval.
 */
export function createStage25LockedIssuerTlsHost({
  assembly,tlsPrivateKey,tlsCertificate
}={}){
  if(!assembly||assembly.mode!=='locked-staging'||
     assembly.publicAuthorizationEnabled!==false||
     typeof assembly.handle!=='function'||!Object.isFrozen(assembly))
    fail();
  const host=issuerHost(assembly.issuer);
  validateTls(host,tlsCertificate,tlsPrivateKey);
  const server=createServer({
    key:tlsPrivateKey,cert:tlsCertificate,
    minVersion:'TLSv1.2',maxHeaderSize:8192,
    requestTimeout:10000,headersTimeout:10000,
    keepAliveTimeout:1500
  },(req,res)=>{
    // HTTPS Host and TLS SNI must agree; never trust proxy headers.
    // No wildcard host, forwarded Host, or insecure path is accepted.
    res.shouldKeepAlive=false;
    if(req.socket?.encrypted!==true||
       req.socket?.servername!==host||
       req.headers.host!==host){
      deny(res,421,'unapproved_tls_host');
      return;
    }
    Promise.resolve().then(()=>assembly.handle(req,res)).catch(()=>{
      deny(res,503,'orca_issuer_not_deployed');
    });
  });
  let starting=false;
  return Object.freeze({
    mode:'loopback-locked-https',
    get listening(){return server.listening;},
    listenLoopback(port=0){
      if(!Number.isInteger(port)||port<0||port>65535||
         starting||server.listening)fail();
      starting=true;
      return new Promise((resolve,reject)=>{
        const onError=()=>{
          starting=false;
          server.off('listening',onListening);
          reject(Error('stage25_locked_https_listener_unavailable'));
        };
        const onListening=()=>{
          starting=false;
          server.off('error',onError);
          const address=server.address();
          resolve(Object.freeze({
            address:'127.0.0.1',port:address.port
          }));
        };
        server.once('error',onError);
        server.once('listening',onListening);
        server.listen(port,'127.0.0.1');
      });
    },
    close(){
      if(!server.listening)return Promise.resolve();
      return new Promise(resolve=>server.close(()=>resolve()));
    }
  });
}

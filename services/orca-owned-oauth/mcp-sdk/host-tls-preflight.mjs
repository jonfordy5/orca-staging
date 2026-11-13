// ORCA Stage 16 — offline TLS material inspector for the public LOCKED pilot.
// This NEVER contacts Supabase, publishes DNS, enables OAuth, logs private
// keys, or validates a public CA chain. Real CA trust and network reachability
// are checked separately by deployment-preflight.mjs over public HTTPS.
import {X509Certificate,createPrivateKey,createPublicKey,timingSafeEqual} from 'node:crypto';

const FQDN=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
function reject(){throw Error('tls_deployment_material_rejected');}
function bufferEqual(a,b){
  return a.length===b.length&&timingSafeEqual(a,b);
}
/**
 * Takes PEM in memory from a private host-side mount; output contains no
 * certificate content, private key, fingerprint or secret-derived values.
 */
export function inspectLockedDeploymentTls({
  certificatePem,privateKeyPem,hostname,minimumDays=14,
  now=()=>Date.now()
}={}){
  if(typeof certificatePem!=='string'||
     typeof privateKeyPem!=='string'||
     typeof hostname!=='string'||!FQDN.test(hostname)||
     !Number.isInteger(minimumDays)||minimumDays<1||minimumDays>90||
     typeof now!=='function')
    reject();
  try{
    const cert=new X509Certificate(certificatePem);
    const key=createPrivateKey(privateKeyPem);
    const actualHost=cert.checkHost(hostname);
    if(actualHost!==hostname)reject();
    // RFC 6125 DNS SAN is required; do not silently accept CN-only material.
    if(!cert.subjectAltName||!cert.subjectAltName.includes('DNS:'))reject();
    const certKey=cert.publicKey.export({type:'spki',format:'der'});
    const privatePublicKey=createPublicKey(key).export({type:'spki',format:'der'});
    if(!bufferEqual(certKey,privatePublicKey))reject();
    const from=Date.parse(cert.validFrom);
    const to=Date.parse(cert.validTo);
    const instant=now();
    if(!Number.isFinite(from)||!Number.isFinite(to)||
       !Number.isSafeInteger(instant)||instant<from||
       to-instant<minimumDays*86400000)
      reject();
    return Object.freeze({
      status:'passed',
      host:hostname,
      certificateMatchesHostname:true,
      privateKeyMatchesCertificate:true,
      minimumValidityDays:minimumDays,
      publicDeploymentAuthorized:false
    });
  }catch{reject();}
}

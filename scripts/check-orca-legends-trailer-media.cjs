// Release gate for the *approved* final, music-only ORCA Legends
// cinematic. Deliberately fails a PR until the exact user-owned media
// file has been uploaded to the GitHub branch.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),path=require('node:path');
const file=path.resolve(__dirname,'..','assets','orca-legends-final-trailer-720p.mp4');
const expectedHash='b5b9608b9f2eb50165d592ba44375c6163e764db27ce3b7316948d4dce00b62b';
const expectedSize=15714245;
assert(fs.existsSync(file),'ORCA trailer asset missing. Upload orca-legends-final-trailer-720p.mp4 to assets/ on the feature branch before merge.');
const stat=fs.statSync(file);
assert.equal(stat.size,expectedSize,'The hosted trailer does not match the approved 40.4-second website export');
const fd=fs.openSync(file,'r'), header=Buffer.alloc(12);
try{fs.readSync(fd,header,0,12,0)}finally{fs.closeSync(fd)}
assert.equal(header.subarray(4,8).toString('ascii'),'ftyp','Video must be a real MP4 rather than a Git LFS pointer or HTML redirect');
const sha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(sha,expectedHash,'Trailer differs from the approved music-only, gold-orca master cut');
console.log('PASS exact ORCA Legends 720p cinematic asset',stat.size,sha);

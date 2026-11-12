// Release gate for the *approved* final, music-only ORCA Legends
// cinematic. Deliberately fails a PR until the exact user-owned media
// file has been uploaded to the GitHub branch.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),path=require('node:path');
const file=path.resolve(__dirname,'..','assets','ORCA_LEGENDS_Final_Mage_Battle_Web_720p.mp4');
const expectedHash='b5b9608b9f2eb50165d592ba44375c6163e764db27ce3b7316948d4dce00b62b';
const expectedSize=15714245;
assert(fs.existsSync(file),'ORCA trailer asset missing. Upload ORCA_LEGENDS_Final_Mage_Battle_Web_720p.mp4 to assets/ on the feature branch before merge.');
const stat=fs.statSync(file);
assert.equal(stat.size,expectedSize,'The hosted trailer does not match the approved 40.4-second website export');
const fd=fs.openSync(file,'r'), header=Buffer.alloc(12);
try{fs.readSync(fd,header,0,12,0)}finally{fs.closeSync(fd)}
assert.equal(header.subarray(4,8).toString('ascii'),'ftyp','Video must be a real MP4 rather than a Git LFS pointer or HTML redirect');
const sha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(sha,expectedHash,'Trailer differs from the approved music-only, gold-orca master cut');
const poster=path.resolve(__dirname,'..','assets','poster.png');
assert(fs.existsSync(poster),'Approved gold-orca poster missing. Upload poster.png into assets/ together with the MP4.');
const png=fs.readFileSync(poster);
assert.equal(png.length,1110612,'Poster size differs from the submitted PNG');
assert(png.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),'Poster must be an actual PNG');
const posterWidth=png.readUInt32BE(16),posterHeight=png.readUInt32BE(20);
assert(posterWidth>=800&&posterHeight>=450&&Math.abs(posterWidth/posterHeight-16/9)<0.13,'Poster must be a landscape cinematic image');
const posterGitSha=crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+png.length+'\0'),png])).digest('hex');
assert.equal(posterGitSha,'c8ec6a334888e5e2f289bc6a1e62261ba9123577',
 'Poster differs from the exact PNG committed by the owner');
console.log('PASS approved ORCA Legends cinematic and uploaded poster',stat.size,sha,posterWidth,posterHeight,posterGitSha);

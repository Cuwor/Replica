const assert=require('node:assert/strict'),C=require('./core.js');
const id='13U_RZh9cTNg8zdp99iLQLSnXNiN5L7GJ';
assert.equal(C.drivePreviewUrl('https://drive.google.com/file/d/'+id+'/view?usp=sharing'),'https://drive.google.com/file/d/'+id+'/preview');
assert.equal(new URL(C.drivePreviewUrl('https://drive.google.com/file/d/'+id+'/view',60.123)).searchParams.get('t'),'60');
assert.throws(()=>C.drivePreviewUrl('https://drive.google.com/file/d/'+id+'/view',NaN));
assert.equal(new URL(C.drivePreviewUrl('https://drive.google.com/file/d/'+id+'/view?resourcekey=0-Test_key')).searchParams.get('resourcekey'),'0-Test_key');
assert.throws(()=>C.drivePreviewUrl('https://drive.google.com.evil.example/file/d/'+id+'/view'));
const key='test_key_Cuwor_12345678901234567890',expected='https://www.googleapis.com/drive/v3/files/'+id+'?alt=media&key='+key;
assert.equal(C.driveVideoUrl('https://drive.google.com/file/d/'+id+'/view?usp=sharing',key),expected);
assert.equal(C.driveVideoUrl('https://drive.google.com/open?id='+id,key),expected);
assert.equal(C.driveVideoUrl('https://drive.google.com/uc?id='+id+'&export=download',key),expected);
assert.equal(new URL(C.driveVideoUrl('https://drive.google.com/file/d/'+id+'/view?resourcekey=0-Test_key',key)).searchParams.get('resourcekey'),'0-Test_key');
for(const value of ['javascript:alert(1)','http://drive.google.com/file/d/'+id,'https://drive.google.com.evil.example/file/d/'+id,'https://user@drive.google.com/file/d/'+id,'https://drive.google.com:999/file/d/'+id,'https://drive.google.com/file/d/x/view','https://drive.google.com/open?id=../file','https://docs.google.com/document/d/'+id])assert.throws(()=>C.driveVideoUrl(value,key));
console.log('PASS Drive video links, resource keys and rejection of foreign hosts, credentials and malformed IDs');

assert.throws(()=>C.driveVideoUrl('https://drive.google.com/file/d/'+id+'/view'));

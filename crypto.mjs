const encoder=new TextEncoder();
function base64(bytes){let out='';for(const b of bytes)out+=String.fromCharCode(b);return btoa(out);}
function unbase64(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
export async function derive(password,salt,iterations=600000) {
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function seal(data,password) {
  const salt=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await derive(password,salt);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('myhealth-v1')},key,encoder.encode(JSON.stringify(data)));
  return {version:1,algorithm:'AES-GCM',kdf:'PBKDF2-SHA256',iterations:600000,salt:base64(salt),iv:base64(iv),ciphertext:base64(new Uint8Array(ciphertext))};
}
export async function unseal(vault,password) {
  if(vault.version!==1||vault.algorithm!=='AES-GCM'||vault.kdf!=='PBKDF2-SHA256'||vault.iterations!==600000)throw new Error('Неподдерживаемый формат архива');
  const key=await derive(password,unbase64(vault.salt),vault.iterations);
  const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(vault.iv),additionalData:encoder.encode('myhealth-v1')},key,unbase64(vault.ciphertext));
  return JSON.parse(new TextDecoder().decode(decrypted));
}

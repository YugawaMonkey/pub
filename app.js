'use strict';
const $=id=>document.getElementById(id);
const palette=[['#eaf0ff','#3c60b4'],['#f4ebdf','#9a713b'],['#e6f0eb','#4e7e69'],['#eee9f7','#8263ac']];
// Public code contains no saved link metadata. Initial links are seeded by setup.sql.
const demoConfig={title:'マイポータル',subtitle:'',backgroundPath:'',links:[]};
const connection=window.PORTAL_CONNECTION||{};
const demo=!connection.url&&!connection.publishableKey&&new URLSearchParams(location.search).get('preview')==='1';
let client=null,user=null,current=null,draft=null,editRevision=null,channel=null,epoch=0,saving=false,uploading=0,signed=new Map(),renderToken=0,poll=null;
function message(text){$('status').textContent=text;$('status').hidden=!text;}
function authMessage(text){$('auth-message').textContent=text;}
function validateUrl(value){
 if(typeof value!=='string')throw Error('リンク先を入力してください。');value=value.trim();
 if(!value||value.length>2048||/[\u0000-\u0020\u007f\\]/.test(value)||value.startsWith('//'))throw Error('リンク先は空白のないファイル名またはHTTPS URLにしてください。');
 if(/^[a-z][a-z0-9+.-]*:/i.test(value)&&!/^https?:\/\//i.test(value))throw Error('このリンクの通信方式は使用できません。');
 const url=new URL(value,'https://portal.invalid/pub/');if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('このリンク先は使用できません。');return value;
}
function assetPath(value){if(value==null||value==='')return '';if(typeof value!=='string'||! /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/i.test(value))throw Error('画像の保存先が不正です。');return value;}
function validateConfig(value){
 if(!value||typeof value.title!=='string'||!value.title.trim()||value.title.length>70||typeof value.subtitle!=='string'||value.subtitle.length>180||!Array.isArray(value.links)||value.links.length>40)throw Error('タイトル・説明・リンク件数を確認してください。');
 return {title:value.title.trim(),subtitle:value.subtitle.trim(),backgroundPath:assetPath(value.backgroundPath),links:value.links.map((link,i)=>{
  if(typeof link.title!=='string'||!link.title.trim()||link.title.length>100||typeof link.description!=='string'||link.description.length>240||typeof link.icon!=='string'||link.icon.length>16)throw Error((i+1)+'件目の名前・説明・アイコンを確認してください。');
  return {title:link.title.trim(),description:link.description.trim(),url:validateUrl(link.url),icon:link.icon.trim()||'📄',iconPath:assetPath(link.iconPath)};
 })};
}
async function imageUrl(path){
 if(!path)return '';const cache=signed.get(path);if(cache&&cache.until>Date.now())return cache.url;
 if(demo)return '';const {data,error}=await client.storage.from('portal-assets').createSignedUrl(path,3600);if(error)throw error;
 signed.set(path,{url:data.signedUrl,until:Date.now()+45*60*1000});return data.signedUrl;
}
async function render(){
 if(!current)return;const token=++renderToken,c=current.config;document.title=c.title;$('page-title').textContent=c.title;$('subtitle').textContent=c.subtitle;
 const query=$('search').value.trim().toLowerCase();$('cards').replaceChildren();let count=0;const jobs=[];
 c.links.forEach((link,index)=>{
  if(![link.title,link.description,link.url].join(' ').toLowerCase().includes(query))return;count++;
  const a=document.createElement('a');a.className='card';a.href=link.url;a.style.setProperty('--tint',palette[index%4][0]);a.style.setProperty('--accent',palette[index%4][1]);
  const top=document.createElement('div');top.className='card-top';const icon=document.createElement('span');icon.className='icon';icon.textContent=link.icon;icon.setAttribute('aria-hidden','true');
  if(link.iconPath)jobs.push(imageUrl(link.iconPath).then(url=>{if(token!==renderToken||!url)return;const img=document.createElement('img');img.src=url;img.alt='';img.onerror=()=>{icon.textContent=link.icon;};icon.replaceChildren(img);}));
  const n=document.createElement('span');n.className='serial';n.textContent='PAGE '+String(index+1).padStart(2,'0');top.append(icon,n);
  const title=document.createElement('h3');title.textContent=link.title;const p=document.createElement('p');p.textContent=link.description;
  const bottom=document.createElement('div');bottom.className='card-bottom';const dest=document.createElement('span');dest.className='destination';dest.textContent=link.url;const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');bottom.append(dest,arrow);a.append(top,title,p,bottom);$('cards').append(a);
 });
 $('count').textContent=query?count+' / '+c.links.length:String(c.links.length);$('empty').hidden=count>0;$('empty').textContent=c.links.length?'該当するページがありません。':'リンクを追加してください。';
 document.body.style.removeProperty('--wallpaper');if(c.backgroundPath)jobs.push(imageUrl(c.backgroundPath).then(url=>{if(token===renderToken&&url)document.body.style.setProperty('--wallpaper','url('+JSON.stringify(url)+')');}));
 const results=await Promise.allSettled(jobs);if(token===renderToken&&results.some(r=>r.status==='rejected'))message('一部の画像を取得できませんでした。接続状態・Storageの権限をご確認ください。');
}
function setRow(row){const config=validateConfig(row.config);if(!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('データの版番号が不正です。');current={...row,config};}
async function loadLatest(){
 if(!client||!user||saving)return;const generation=epoch;
 try{const {data,error}=await client.from('portal_settings').select('id,owner_id,config,revision,updated_at').eq('id','main').maybeSingle();if(generation!==epoch)return;if(error)throw error;
  if(!data){current=null;renderToken++;$('cards').replaceChildren();document.body.style.removeProperty('--wallpaper');$('portal').hidden=true;$('edit').hidden=true;$('auth-panel').hidden=false;authMessage('このアカウントの設定がありません。管理者登録と初期SQLを確認してください。');return;}
  if(data.owner_id!==user.id)throw Error('管理者の設定を確認してください。');
  if($('editor').open){if(data.revision!==editRevision){$('conflict').hidden=false;$('save').disabled=true;}return;}
  if(current&&data.revision<current.revision)return;
  const changed=!current||current.revision!==data.revision;setRow(data);$('auth-panel').hidden=true;$('portal').hidden=false;$('edit').hidden=false;if(changed)await render();
 }catch(error){if(generation===epoch){if(!current)authMessage('データを取得できません。接続設定と初期SQLを確認してください。');else message('同期に失敗しました。接続が戻ると再試行します。');}}
}
function updateSaveState(){$('save').disabled=saving||uploading>0||!$('conflict').hidden;document.querySelectorAll('#editor input[type="file"]').forEach(input=>input.disabled=saving||uploading>0);}
function collectDraft(){if(!draft)return;draft.title=$('portal-title').value;draft.subtitle=$('portal-subtitle').value;draft.links=[...$('edit-rows').children].map(row=>({title:row.querySelector('[data-field="title"]').value,description:row.querySelector('[data-field="description"]').value,url:row.querySelector('[data-field="url"]').value,icon:row.querySelector('[data-field="icon"]').value,iconPath:row.dataset.iconPath||''}));}
function showEditError(text){$('edit-error').textContent=text;$('edit-error').hidden=false;}
async function uploadImage(file){
 const types={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};
 if(!types[file.type]||file.size>5*1024*1024||file.size===0)throw Error('5MB以下のPNG・JPEG・WebP・GIFを選択してください。');
 if(demo)throw Error('プレビューでは画像を保存できません。Supabase接続後に使用できます。');
 const generation=epoch,uid=user?.id;if(!uid)throw Error('ログインしてください。');const path=uid+'/'+crypto.randomUUID()+'.'+types[file.type];
 const {error}=await client.storage.from('portal-assets').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});if(error)throw Error('画像の保存に失敗しました。Storageの権限や通信状態をご確認ください。');if(generation!==epoch)throw Error('ログイン状態が変わりました。');
 return {path,url:await imageUrl(path)};
}
async function uploadAndApply(file,apply){
 if(!file||saving||uploading)return;uploading++;updateSaveState();$('upload-message').textContent='画像をアップロード中…';
 const targetDraft=draft;try{const result=await uploadImage(file);if(draft===targetDraft&&draft){apply(result);$('upload-message').textContent='画像をアップロードしました。「保存して反映」で確定します。';}}catch(error){if(draft===targetDraft)showEditError(error.message);}finally{uploading--;updateSaveState();if(!uploading&&$('upload-message').textContent==='画像をアップロード中…')$('upload-message').textContent='';}
}
function drawRows(){
 $('edit-rows').replaceChildren();$('add-link').disabled=draft.links.length>=40;
 draft.links.forEach((link,index)=>{
  const row=document.createElement('div');row.className='editor-row';row.dataset.iconPath=link.iconPath||'';
  const top=document.createElement('div');top.className='row-top';const n=document.createElement('b');n.textContent='PAGE '+String(index+1).padStart(2,'0');const buttons=document.createElement('div');buttons.className='row-actions';
  for(const [action,label] of [['up','↑'],['down','↓'],['remove','削除']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',(index+1)+'件目を'+({up:'上へ移動',down:'下へ移動',remove:'削除'}[action]));b.disabled=action==='up'&&index===0||action==='down'&&index===draft.links.length-1;
   b.onclick=()=>{if(uploading||saving)return;collectDraft();let at=index;if(action==='remove')draft.links.splice(index,1);else{at=index+(action==='up'?-1:1);[draft.links[index],draft.links[at]]=[draft.links[at],draft.links[index]];}drawRows();($('edit-rows').children[Math.min(at,draft.links.length-1)]?.querySelector('input')||$('add-link')).focus();};buttons.append(b);}
  top.append(n,buttons);row.append(top);const fields=document.createElement('div');fields.className='fields';
  for(const [key,label,max] of [['title','ページ名',100],['url','リンク先',2048],['description','説明',240],['icon','アイコン（絵文字・文字）',16]]){const f=document.createElement('div');f.className='field';const lab=document.createElement('label');lab.htmlFor='link-'+index+'-'+key;lab.textContent=label;const input=document.createElement('input');input.id=lab.htmlFor;input.dataset.field=key;input.value=link[key]||'';input.maxLength=max;input.required=['title','url'].includes(key);f.append(lab,input);fields.append(f);}
  const imageBox=document.createElement('div');imageBox.className='field full';const label=document.createElement('label');label.htmlFor='image-'+index;label.textContent='画像アイコン（任意・文字より優先）';const preview=document.createElement('img');preview.className='image-preview';preview.alt='アイコンのプレビュー';preview.hidden=true;
  if(link.iconPath)imageUrl(link.iconPath).then(url=>{if(row.isConnected&&url){preview.src=url;preview.hidden=false;}}).catch(()=>{});
  const file=document.createElement('input');file.type='file';file.id=label.htmlFor;file.accept='image/png,image/jpeg,image/webp,image/gif';file.onchange=()=>uploadAndApply(file.files[0],result=>{if(row.isConnected){row.dataset.iconPath=result.path;preview.src=result.url;preview.hidden=false;}});
  const clear=document.createElement('button');clear.type='button';clear.textContent='画像を解除';clear.onclick=()=>{if(uploading||saving)return;row.dataset.iconPath='';preview.hidden=true;preview.removeAttribute('src');file.value='';};imageBox.append(label,preview,file,clear);fields.append(imageBox);row.append(fields);$('edit-rows').append(row);
 });
}
function openEditor(){if(!current)return;draft=structuredClone(current.config);editRevision=current.revision;$('portal-title').value=draft.title;$('portal-subtitle').value=draft.subtitle;$('edit-error').hidden=true;$('conflict').hidden=true;$('upload-message').textContent='';$('background-file').value='';$('background-preview').hidden=true;
 if(draft.backgroundPath){const target=draft;imageUrl(draft.backgroundPath).then(url=>{if(draft===target&&url){$('background-preview').src=url;$('background-preview').hidden=false;}}).catch(()=>{});}
 drawRows();updateSaveState();$('editor').showModal();$('portal-title').focus();}
function closeEditor(){if(saving||uploading){showEditError('保存・アップロードが終わるまでお待ちください。');return;}draft=null;$('editor').close();$('edit').focus();if(!demo)loadLatest();}
async function save(){
 if(saving||uploading||!$('conflict').hidden)return;collectDraft();let value;try{value=validateConfig(draft);}catch(e){showEditError(e.message);return;}
 saving=true;updateSaveState();$('editor').querySelector('.editor-body').inert=true;$('save').textContent='保存中…';const generation=epoch;
 try{if(demo){setRow({...current,config:value,revision:current.revision+1});}else{
   const {data,error}=await client.from('portal_settings').update({config:value}).eq('id','main').eq('revision',editRevision).select('id,owner_id,config,revision,updated_at').maybeSingle();if(generation!==epoch)return;if(error)throw Error('保存に失敗しました。通信状態と編集権限をご確認ください。');
   if(!data){$('conflict').hidden=false;throw Error('他の端末で更新されたか、編集権限が変更されています。キャンセルして再読み込みしてください。');}setRow(data);
  }
  draft=null;$('editor').close();$('search').value='';await render();if(generation!==epoch)return;message(demo?'プレビューに反映しました。Supabaseには保存していません。':'Supabaseに保存しました。他の端末にも反映されます。');$('edit').focus();
 }catch(error){if(generation===epoch)showEditError(error.message);}finally{saving=false;$('editor').querySelector('.editor-body').inert=false;$('save').textContent='保存して反映';updateSaveState();if(!demo)loadLatest();}
}
async function changeSession(session){
 const generation=++epoch;renderToken++;user=session?.user||null;current=null;draft=null;signed.clear();$('cards').replaceChildren();$('portal').hidden=true;$('editor').close();$('edit').hidden=true;$('auth-panel').hidden=false;$('logout').hidden=!user;document.body.style.removeProperty('--wallpaper');
 if(channel){client.removeChannel(channel);channel=null;}clearInterval(poll);
 if(!user){$('sync').textContent='ログインが必要です';return;}
 $('sync').textContent='接続中';await loadLatest();if(!user||generation!==epoch)return;
 channel=client.channel('portal-main-'+epoch).on('postgres_changes',{event:'UPDATE',schema:'public',table:'portal_settings',filter:'id=eq.main'},()=>{if(generation===epoch)loadLatest();}).subscribe(status=>{if(generation!==epoch)return;if(status==='SUBSCRIBED'){$('sync').textContent='リアルタイム同期中';loadLatest();}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))$('sync').textContent='再接続待ち · 定期確認中';});
 poll=setInterval(()=>{if(document.visibilityState==='visible')loadLatest();},60000);
}
$('login-form').onsubmit=async event=>{event.preventDefault();if(!client)return;$('login').disabled=true;authMessage('ログイン中…');try{const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;$('password').value='';authMessage('');}catch{authMessage('ログインできませんでした。メールアドレス・パスワード・通信状態をご確認ください。');}finally{$('login').disabled=false;}};
$('logout').onclick=async()=>{if(demo)return;$('logout').disabled=true;const {error}=await client.auth.signOut({scope:'local'});$('logout').disabled=false;if(error)message('ログアウトできませんでした。通信状態を確認し再度お試しください。');};
$('edit').onclick=openEditor;$('close-editor').onclick=closeEditor;$('cancel-editor').onclick=closeEditor;$('editor').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
$('editor-form').onsubmit=event=>{event.preventDefault();save();};$('search').oninput=render;
$('add-link').onclick=()=>{if(uploading||saving)return;collectDraft();if(draft.links.length>=40)return;draft.links.push({title:'',description:'',url:'',icon:'📄',iconPath:''});drawRows();$('edit-rows').lastElementChild.querySelector('input').focus();};
$('background-file').onchange=()=>uploadAndApply($('background-file').files[0],result=>{draft.backgroundPath=result.path;$('background-preview').src=result.url;$('background-preview').hidden=false;});
$('clear-background').onclick=()=>{if(uploading||saving)return;draft.backgroundPath='';$('background-preview').hidden=true;$('background-preview').removeAttribute('src');$('background-file').value='';};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){signed.clear();if(current)render();loadLatest();}});
setInterval(()=>{if(current&&document.visibilityState==='visible'){signed.clear();render();}},45*60*1000);
if(demo){user={id:'preview'};setRow({config:demoConfig,revision:1});$('auth-panel').hidden=true;$('portal').hidden=false;$('edit').hidden=false;$('sync').textContent='プレビュー · クラウド未接続';render();}
else if(!connection.url||!connection.publishableKey){$('login').disabled=true;$('sync').textContent='Supabase設定待ち';authMessage('Project URLと公開用キーの設定が必要です。初期設定後は画面から保存できます。');}
else{try{
 const url=new URL(connection.url);if(url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password)throw Error('Invalid URL');
 if(!/^sb_publishable_/.test(connection.publishableKey)){const payload=JSON.parse(atob(connection.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw Error('Use public key');}
 client=supabase.createClient(connection.url,connection.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 client.auth.onAuthStateChange((event,session)=>{if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT'].includes(event))setTimeout(()=>{if(event==='SIGNED_IN'&&user?.id===session?.user?.id)return;changeSession(session);},0);});
 }catch{$('login').disabled=true;$('sync').textContent='接続設定エラー';authMessage('Project URLとPublishable key（またはanon key）を確認してください。秘密キーは使用できません。');}}

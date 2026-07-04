import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, set, remove, onValue, onChildAdded, onChildRemoved, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { setupAudio } from "./audio.js";
import { setupUI } from "./ui.js";
import { setupWebRTC } from "./webrtc.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const state = {
  room:"",
  myName:"",
  myPeerId:"",
  myDeviceId:"",
  localStream:null,
  pcs:{},
  users:{},
  isTalking:false,
  lastSpeakerId:null,
  currentSpeakerId:null,
  joinedOnce:false
};

const audio = setupAudio();
const ui = setupUI(state);

const joinBtn = document.getElementById("joinBtn");
const talkBtn = document.getElementById("talkBtn");
const talkMain = document.getElementById("talkMain");
const talkSub = document.getElementById("talkSub");

let rtc = null;

function getDeviceId(){
  let id = localStorage.getItem("walkie_device");
  if(!id){
    id = "device-" + crypto.randomUUID();
    localStorage.setItem("walkie_device", id);
  }
  return id;
}

function getPeerId(){
  let id = localStorage.getItem("walkie_radio");
  if(!id){
    id = "radio-" + crypto.randomUUID().replace(/-/g,"").substring(0,14);
    localStorage.setItem("walkie_radio", id);
  }
  return id;
}

function createAudio(peerId, stream){
  let audioEl = document.getElementById("audio-" + peerId);
  if(!audioEl){
    audioEl = document.createElement("audio");
    audioEl.id = "audio-" + peerId;
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    document.body.appendChild(audioEl);
  }
  audioEl.srcObject = stream;
  audioEl.volume = 1;
  audioEl.muted = false;
  audioEl.play().catch(()=>{});
}

async function joinRoom(){
  const nameInput = document.getElementById("nameInput");
  const roomInput = document.getElementById("roomInput");

  state.myName = nameInput.value.trim();
  state.room = roomInput.value.trim();

  if(!state.myName || !state.room){
    alert("Completa los datos");
    return;
  }

  localStorage.setItem("walkie_name", state.myName);
  localStorage.setItem("walkie_room", state.room);

  state.myDeviceId = getDeviceId();
  state.myPeerId = getPeerId();

  try{
    state.localStream = await navigator.mediaDevices.getUserMedia({audio:true, video:false});
  }catch{
    alert("Permite el micrÃ³fono para usar el walkie.");
    return;
  }

  state.localStream.getAudioTracks().forEach(track=>{ track.enabled = false; });

  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("radioBox").classList.remove("hidden");

  document.getElementById("roomLabel").textContent = state.room;
  document.getElementById("nameLabel").textContent = state.myName;
  document.getElementById("deviceIdLabel").textContent = state.myDeviceId;
  document.getElementById("myIdLabel").textContent = state.myPeerId;

  rtc = setupWebRTC({db,state,createAudio});

  const myRef = ref(db, `rooms/${state.room}/peers/${state.myPeerId}`);
  await set(myRef, {
    id: state.myPeerId,
    name: state.myName,
    deviceId: state.myDeviceId,
    joinedAt: serverTimestamp()
  });

  onDisconnect(myRef).remove();
  onDisconnect(ref(db, `rooms/${state.room}/signals/${state.myPeerId}`)).remove();

  onChildAdded(ref(db, `rooms/${state.room}/peers`), async snap=>{
    const user = snap.val();
    const remoteId = snap.key;
    const alreadyExists = state.users[remoteId];

    state.users[remoteId] = user;
    ui.renderUsers();

    if(state.joinedOnce && !alreadyExists && remoteId !== state.myPeerId){
      audio.join();
      ui.showJoinToast(`ð¤ ${user.name || "Usuario"} entrÃ³ a la sala`);
    }

    if(remoteId !== state.myPeerId){
      rtc.makePC(remoteId);
      if(state.myPeerId > remoteId){
        setTimeout(()=>rtc.callPeer(remoteId), 500);
      }
    }
  });

  onChildRemoved(ref(db, `rooms/${state.room}/peers`), snap=>{
    const remoteId = snap.key;
    delete state.users[remoteId];
    ui.renderUsers();
    rtc.cleanupPeer(remoteId);
  });

  onValue(ref(db, `rooms/${state.room}/speaking`), snap=>{
    const data = snap.val();

    if(data && data.id !== state.myPeerId){
      if(state.lastSpeakerId !== data.id){
        audio.start();
      }
      state.lastSpeakerId = data.id;
      state.currentSpeakerId = data.id;
      ui.showSpeaker(data.name || "Usuario");
      ui.renderUsers();
    }

    if(!data){
      if(state.lastSpeakerId && state.lastSpeakerId !== state.myPeerId){
        audio.end();
      }
      state.lastSpeakerId = null;
      state.currentSpeakerId = null;
      ui.hideSpeaker();
      ui.renderUsers();
    }
  });

  setTimeout(()=>{ state.joinedOnce = true; }, 1500);
}

function startTalking(){
  if(state.isTalking || !state.localStream) return;
  state.isTalking = true;
  state.currentSpeakerId = state.myPeerId;

  audio.start();
  state.localStream.getAudioTracks().forEach(track=>{ track.enabled = true; });

  talkBtn.classList.add("transmitting");
  talkMain.textContent = "TRANSMITIENDO";
  talkSub.style.display = "none";
  ui.showSpeaker(state.myName);
  ui.renderUsers();

  set(ref(db, `rooms/${state.room}/speaking`), {
    id: state.myPeerId,
    name: state.myName,
    time: Date.now()
  });
}

function stopTalking(){
  if(!state.isTalking || !state.localStream) return;
  state.isTalking = false;

  audio.end();
  state.localStream.getAudioTracks().forEach(track=>{ track.enabled = false; });

  talkBtn.classList.remove("transmitting");
  talkMain.textContent = "HABLAR";
  talkSub.style.display = "block";
  state.currentSpeakerId = null;
  ui.hideSpeaker();
  ui.renderUsers();

  remove(ref(db, `rooms/${state.room}/speaking`));
}

talkBtn.addEventListener("pointerdown", e=>{
  e.preventDefault();
  try{ talkBtn.setPointerCapture(e.pointerId); }catch{}
  startTalking();
});

talkBtn.addEventListener("pointerup", e=>{
  e.preventDefault();
  try{ talkBtn.releasePointerCapture(e.pointerId); }catch{}
  stopTalking();
});

talkBtn.addEventListener("pointercancel", e=>{
  e.preventDefault();
  stopTalking();
});

joinBtn.addEventListener("click", joinRoom);

window.addEventListener("load",()=>{
  const savedName = localStorage.getItem("walkie_name");
  const savedRoom = localStorage.getItem("walkie_room");
  if(savedName) document.getElementById("nameInput").value = savedName;
  if(savedRoom) document.getElementById("roomInput").value = savedRoom;
});

window.addEventListener("beforeunload",()=>{
  if(state.room && state.myPeerId){
    remove(ref(db, `rooms/${state.room}/peers/${state.myPeerId}`));
  }
});

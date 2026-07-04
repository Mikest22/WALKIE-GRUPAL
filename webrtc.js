import { ref, set, push, onValue, onChildAdded } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const defaultIceServers = [
  {urls:"stun:stun.l.google.com:19302"},
  {urls:"stun:stun1.l.google.com:19302"},
  {urls:"stun:stun2.l.google.com:19302"}
];

export function setupWebRTC({db,state,createAudio}){
  function makePC(remoteId){
    if(state.pcs[remoteId]) return state.pcs[remoteId];

    const pc = new RTCPeerConnection({iceServers: defaultIceServers});

    state.localStream.getTracks().forEach(track=>{
      pc.addTrack(track, state.localStream);
    });

    pc.ontrack = e=>{
      createAudio(remoteId, e.streams[0]);
    };

    pc.onicecandidate = e=>{
      if(e.candidate){
        push(ref(db, `rooms/${state.room}/signals/${remoteId}/${state.myPeerId}/candidates`), e.candidate.toJSON());
      }
    };

    state.pcs[remoteId] = pc;
    listenSignals(remoteId, pc);
    return pc;
  }

  function listenSignals(remoteId, pc){
    onValue(ref(db, `rooms/${state.room}/signals/${state.myPeerId}/${remoteId}/offer`), async snap=>{
      const offer = snap.val();
      if(!offer) return;
      try{
        if(!pc.currentRemoteDescription){
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await set(ref(db, `rooms/${state.room}/signals/${remoteId}/${state.myPeerId}/answer`), {
            type: answer.type,
            sdp: answer.sdp,
            time: Date.now()
          });
        }
      }catch(err){ console.warn("offer error", err); }
    });

    onValue(ref(db, `rooms/${state.room}/signals/${state.myPeerId}/${remoteId}/answer`), async snap=>{
      const answer = snap.val();
      if(!answer) return;
      try{
        if(pc.signalingState !== "stable"){
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      }catch(err){ console.warn("answer error", err); }
    });

    onChildAdded(ref(db, `rooms/${state.room}/signals/${state.myPeerId}/${remoteId}/candidates`), async snap=>{
      const candidate = snap.val();
      if(!candidate) return;
      try{ await pc.addIceCandidate(new RTCIceCandidate(candidate)); }catch(err){ console.warn("candidate error", err); }
    });
  }

  async function callPeer(remoteId){
    const pc = makePC(remoteId);
    try{
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await set(ref(db, `rooms/${state.room}/signals/${remoteId}/${state.myPeerId}/offer`), {
        type: offer.type,
        sdp: offer.sdp,
        time: Date.now()
      });
    }catch(err){ console.warn("callPeer error", err); }
  }

  function cleanupPeer(remoteId){
    if(state.pcs[remoteId]){
      try{ state.pcs[remoteId].close(); }catch{}
      delete state.pcs[remoteId];
    }
    const audio = document.getElementById("audio-" + remoteId);
    if(audio) audio.remove();
  }

  return {makePC, callPeer, cleanupPeer};
}

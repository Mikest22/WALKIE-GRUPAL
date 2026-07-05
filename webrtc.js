import {
  ref,
  set,
  push,
  onValue,
  onChildAdded,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

/*
  Walkie Pro — conexión WebRTC mejorada.
  Evita que candidatos ICE se pierdan al llegar antes
  que la oferta o la respuesta.
*/

const defaultIceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" }
];

export function setupWebRTC({ db, state, createAudio }) {
  const pendingCandidates = new Map();

  function getPendingCandidates(remoteId) {
    if (!pendingCandidates.has(remoteId)) {
      pendingCandidates.set(remoteId, []);
    }

    return pendingCandidates.get(remoteId);
  }

  async function addCandidate(remoteId, pc, candidateData) {
    if (!candidateData) return;

    if (!pc.remoteDescription || !pc.remoteDescription.type) {
      getPendingCandidates(remoteId).push(candidateData);
      return;
    }

    try {
      await pc.addIceCandidate(
        new RTCIceCandidate(candidateData)
      );
    } catch (error) {
      console.warn("Error al agregar candidato ICE:", error);
    }
  }

  async function applyPendingCandidates(remoteId, pc) {
    const queue = getPendingCandidates(remoteId);

    while (queue.length > 0) {
      const candidateData = queue.shift();

      try {
        await pc.addIceCandidate(
          new RTCIceCandidate(candidateData)
        );
      } catch (error) {
        console.warn("Error en candidato ICE guardado:", error);
      }
    }
  }

  function makePC(remoteId) {
    if (state.pcs[remoteId]) {
      return state.pcs[remoteId];
    }

    const pc = new RTCPeerConnection({
      iceServers: defaultIceServers
    });

    state.localStream.getTracks().forEach(track => {
      pc.addTrack(track, state.localStream);
    });

    pc.ontrack = event => {
      const remoteStream = event.streams?.[0];

      if (remoteStream) {
        createAudio(remoteId, remoteStream);
      }
    };

    pc.onicecandidate = event => {
      if (!event.candidate) return;

      push(
        ref(
          db,
          `rooms/${state.room}/signals/${remoteId}/${state.myPeerId}/candidates`
        ),
        event.candidate.toJSON()
      );
    };

    pc.onconnectionstatechange = () => {
      console.log(
        `Conexión con ${remoteId}: ${pc.connectionState}`
      );
    };

    state.pcs[remoteId] = pc;

    listenSignals(remoteId, pc);

    return pc;
  }

  function listenSignals(remoteId, pc) {
    onValue(
      ref(
        db,
        `rooms/${state.room}/signals/${state.myPeerId}/${remoteId}/offer`
      ),
      async snap => {
        const offer = snap.val();

        if (!offer || pc.connectionState === "closed") return;

        try {
          const sameOffer =
            pc.currentRemoteDescription &&
            pc.currentRemoteDescription.sdp === offer.sdp;

          if (sameOffer) return;

          if (pc.signalingState !== "stable") return;

          await pc.setRemoteDescription(
            new RTCSessionDescription(offer)
          );

          await applyPendingCandidates(remoteId, pc);

          const answer = await pc.createAnswer();

          await pc.setLocalDescription(answer);

          await set(
            ref(
              db,
              `rooms/${state.room}/signals/${remoteId}/${state.myPeerId}/answer`
            ),
            {
              type: answer.type,
              sdp: answer.sdp,
              time: Date.now()
            }
          );
        } catch (error) {
          console.warn("Error al recibir oferta:", error);
        }
      }
    );
    
        onValue(
      ref(
        db,
        `rooms/${state.room}/signals/${state.myPeerId}/${remoteId}/answer`
      ),
      async snap => {
        const answer = snap.val();

        if (!answer || pc.connectionState === "closed") return;

        try {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(
              new RTCSessionDescription(answer)
            );

            await applyPendingCandidates(remoteId, pc);
          }
        } catch (error) {
          console.warn("Error al recibir respuesta:", error);
        }
      }
    );

    onChildAdded(
      ref(
        db,
        `rooms/${state.room}/signals/${state.myPeerId}/${remoteId}/candidates`
      ),
      async snap => {
        await addCandidate(
          remoteId,
          pc,
          snap.val()
        );
      }
    );
  }

  async function callPeer(remoteId) {
    const pc = makePC(remoteId);

    if (pc.connectionState === "closed") return;
    if (pc.signalingState !== "stable") return;

    try {
      await remove(
        ref(
          db,
          `rooms/${state.room}/signals/${remoteId}/${state.myPeerId}`
        )
      );

      await remove(
        ref(
          db,
          `rooms/${state.room}/signals/${state.myPeerId}/${remoteId}`
        )
      );

      pendingCandidates.set(remoteId, []);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      await pc.setLocalDescription(offer);

      await set(
        ref(
          db,
          `rooms/${state.room}/signals/${remoteId}/${state.myPeerId}/offer`
        ),
        {
          type: offer.type,
          sdp: offer.sdp,
          time: Date.now()
        }
      );
    } catch (error) {
      console.warn("Error al llamar al usuario:", error);
    }
  }

  function cleanupPeer(remoteId) {
    if (state.pcs[remoteId]) {
      try {
        state.pcs[remoteId].close();
      } catch {}

      delete state.pcs[remoteId];
    }

    pendingCandidates.delete(remoteId);

    const audio = document.getElementById(
      "audio-" + remoteId
    );

    if (audio) {
      audio.remove();
    }
  }

  return {
    makePC,
    callPeer,
    cleanupPeer
  };
}
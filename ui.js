export function setupUI(state){
  const floatingSpeaker = document.getElementById("floatingSpeaker");
  const joinToast = document.getElementById("joinToast");
  const usersBox = document.getElementById("usersBox");
  const usersCountText = document.getElementById("usersCountText");
  const usersScreen = document.getElementById("usersScreen");
  const usersListScreen = document.getElementById("usersListScreen");
  const openUsersPanel = document.getElementById("openUsersPanel");
  const closeUsersScreen = document.getElementById("closeUsersScreen");

  function showSpeaker(name){
    floatingSpeaker.textContent = `🎙️ ${name} está hablando`;
    floatingSpeaker.classList.remove("hidden");
  }

  function hideSpeaker(){
    floatingSpeaker.classList.add("hidden");
  }

  function showJoinToast(text){
    joinToast.textContent = text;
    joinToast.classList.remove("hidden");
    clearTimeout(showJoinToast.timer);
    showJoinToast.timer = setTimeout(()=>joinToast.classList.add("hidden"), 2600);
  }

  function signalForUser(id){
    let hash = 0;
    for(let i=0;i<id.length;i++) hash += id.charCodeAt(i);
    const level = hash % 3;
    if(level === 0) return {text:"Excelente", icon:"📶🛜", color:"#00ff88"};
    if(level === 1) return {text:"Buena", icon:"📶", color:"#ffe066"};
    return {text:"Regular", icon:"📶", color:"#ff9f43"};
  }

  function getOtherUserIds(){
    return Object.keys(state.users).filter(id => id !== state.myPeerId);
  }

  function renderUsers(){
    const ids = getOtherUserIds();
    usersBox.innerHTML = "";
    usersCountText.textContent = `${ids.length} conectados`;

    if(ids.length === 0){
      usersBox.innerHTML = `<div class="user">Esperando usuarios...</div>`;
      renderUsersScreen();
      return;
    }

    ids.forEach(id=>{
      const div = document.createElement("div");
      const speaking = state.currentSpeakerId === id;
      div.className = "user" + (speaking ? " speaking-user" : "");
      div.innerHTML = `<b>${speaking ? "🎙️ " : "🟢 "}${state.users[id].name || "Usuario"}${speaking ? " está hablando" : ""}</b>`;
      usersBox.appendChild(div);
    });

    renderUsersScreen();
  }

  function renderUsersScreen(){
    const ids = getOtherUserIds();
    usersListScreen.innerHTML = "";

    if(ids.length === 0){
      usersListScreen.innerHTML = `<div class="user-card" style="text-align:center;">No hay usuarios conectados</div>`;
      return;
    }

    ids.forEach(id=>{
      const user = state.users[id];
      const signal = signalForUser(id);
      const speaking = state.currentSpeakerId === id;
      const card = document.createElement("div");
      card.className = "user-card" + (speaking ? " speaking-card" : "");
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div class="icon-box">${speaking ? "🎙️" : "👤"}</div>
          <div>
            <div class="label">Usuario</div>
            <div class="value">${user.name || "Usuario"}</div>
            ${speaking ? `<div style="color:#00ff88;font-weight:bold;margin-top:4px;">TRANSMITIENDO AHORA</div>` : ""}
          </div>
        </div>
        <div class="label">📱 ID dispositivo</div>
        <div class="id-value">${user.deviceId || "No disponible"}</div>
        <div class="label yellow" style="margin-top:10px;">📡 ID Radio</div>
        <div class="id-value">${id}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
          <div style="color:${signal.color};font-weight:bold;font-size:16px;">${signal.icon} ${signal.text}</div>
          <div style="color:#00ff88;font-weight:bold;">🟢 EN LÍNEA</div>
        </div>`;
      usersListScreen.appendChild(card);
    });
  }

  openUsersPanel.addEventListener("click",()=>{
    usersScreen.classList.remove("hidden");
    renderUsersScreen();
  });

  closeUsersScreen.addEventListener("click",()=>{
    usersScreen.classList.add("hidden");
  });

  return {showSpeaker, hideSpeaker, showJoinToast, renderUsers};
}

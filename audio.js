export function setupAudio(){
  const startSound = document.getElementById("startSound");
  const endSound = document.getElementById("endSound");
  const joinSound = document.getElementById("joinSound");

  [startSound,endSound,joinSound].forEach(audio=>{
    if(!audio) return;
    audio.volume = audio === joinSound ? 0.7 : 1;
    audio.preload = "auto";
  });

  function beep(type){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = type === "end" ? 650 : 1200;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    }catch{}
  }

  function play(audio, type){
    try{
      audio.pause();
      audio.currentTime = 0;
      audio.play().catch(()=>beep(type));
    }catch{ beep(type); }
  }

  return {
    start(){ play(startSound, "start"); },
    end(){ play(endSound, "end"); },
    join(){ play(joinSound, "start"); }
  };
}

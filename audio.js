// All sounds are synthesized locally. Audio starts only after a user gesture.
export class GameAudio {
  constructor(muted=false){this.muted=muted;this.ctx=null;this.lastBrake=0;}
  init(){
    if(!this.ctx){
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return;
      this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:.22;this.master.connect(this.ctx.destination);
      this.engine=this.ctx.createOscillator();this.engine.type='sawtooth';
      const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=260;
      this.engineGain=this.ctx.createGain();this.engineGain.gain.value=0;
      this.engine.connect(filter);filter.connect(this.engineGain);this.engineGain.connect(this.master);this.engine.start();
    }
    if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
  }
  setMuted(muted){this.muted=muted;if(this.master)this.master.gain.setTargetAtTime(muted?0:.22,this.ctx.currentTime,.05);}
  tone(freq,duration=.1,type='sine',volume=.3,delay=0){
    if(!this.ctx)return;
    const now=this.ctx.currentTime+delay,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(freq,now);gain.gain.setValueAtTime(.001,now);gain.gain.exponentialRampToValueAtTime(volume,now+.01);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    osc.connect(gain);gain.connect(this.master);osc.start(now);osc.stop(now+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  click(){this.tone(650,.055,'sine',.17);}
  countdown(go=false){this.tone(go?880:440,go?.35:.14,'triangle',.5);}
  collision(){this.tone(85,.15,'triangle',.5);this.tone(130,.12,'sawtooth',.13);}
  victory(){[523,659,784,1046,784,1046].forEach((n,i)=>this.tone(n,.3,'triangle',.4,i*.15));}
  update(speed,active,braking){
    if(!this.ctx)return;
    this.engine.frequency.setTargetAtTime(40+Math.abs(speed)*3.4,this.ctx.currentTime,.15);
    this.engineGain.gain.setTargetAtTime(active?.055+Math.abs(speed)*.002:0,this.ctx.currentTime,.1);
    if(active&&braking&&Math.abs(speed)>12&&this.ctx.currentTime-this.lastBrake>.35){this.tone(190+Math.random()*80,.09,'triangle',.08);this.lastBrake=this.ctx.currentTime;}
  }
}

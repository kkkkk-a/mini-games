/**
 * Neo Tactics - Calc & Crash (Fixed Hand & Cost Logic)
 */
window.CalcGame = {
    phase: 'idle',
    p1: { hand: [], chips: [], select: null },
    p2: { hand: [], chips: [], select: null },
    buffer: [],
    attacker: 'p1',
    timer: 20,
    timerId: null,
    isPlaying: false,
    mode: null,      // 'npc', 'local', 'online-host', 'online-guest'
    role: 'p1',      
    localTurn: 'p1', 

    init(mode) {
        this.mode = mode;
        this.role = mode === 'online-guest' ? 'p2' : 'p1';
        this.isPlaying = true;

        Shared.UI.show('screen-game');
        document.querySelectorAll('.touch-group').forEach(e => e.classList.remove('active'));
        Shared.UI.toggleLayout('ui-calc', false);

        const cvs = document.getElementById('main-cvs');
        
        // 内部解像度を固定
        cvs.width = 600;
        cvs.height = 800;

        if (mode.includes('online')) {
            Shared.Net.onData = (d) => this.onNet(d);
        }

        this.reset();
        this.startSelectPhase();
    },

    reset() {
        const initHand = () =>[1, 2, 3, 5, 7, 9]; 
        
        this.p1 = { hand: initHand(), chips:['+', '-', '*', '/'], select: null };
        this.p2 = { hand: initHand(), chips: ['+', '-', '*', '/'], select: null };
        
        // ★修正: オンライン同期ズレを防ぐため、常にp1からスタート
        this.attacker = 'p1';
        this.localTurn = 'p1';
        this.updateHUD();
    },

    // 終了処理 (メニューに戻る時用)
    stop() {
        this.isPlaying = false;
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        Shared.UI.toggleLayout('ui-calc', false);
        document.getElementById('game-timer').style.display = 'none';
        
        const handContainer = document.getElementById('calc-hand-container');
        if (handContainer) handContainer.remove();
    },

    // --- フェーズ1: カード選択 ---
    startSelectPhase() {
        this.phase = 'select';
        this.p1.select = null;
        this.p2.select = null;
        this.localTurn = 'p1';
        
        Shared.UI.toggleLayout('ui-calc', false);
        this.startTimer(20, () => this.autoSelect());
        this.updateBoardUI();
    },

    updateBoardUI() {
        const cvs = document.getElementById('main-cvs');
        const ctx = cvs.getContext('2d');
        
        // 背景
        ctx.fillStyle = '#000'; 
        ctx.fillRect(0, 0, cvs.width, cvs.height);

        // テキスト
        const fs = Math.floor(cvs.width / 20);
        ctx.font = `bold ${fs}px 'Orbitron', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let msgTop = "";
        let msgBottom = "";

        if (this.mode === 'local') {
            if (this.localTurn === 'p1') {
                msgTop = "P2待機中...";
                msgBottom = "P1: カードを選んでください";
            } else {
                msgTop = "P1選択済み";
                msgBottom = "P2: カードを選んでください";
            }
        } else {
            const oppName = this.mode === 'npc' ? "CPU" : "OPPONENT";
            const myName = "YOU";
            const oppHand = this.role === 'p1' ? this.p2.hand.length : this.p1.hand.length;
            
            msgTop = `${oppName}: ${oppHand} CARDS`;
            msgBottom = this[this.role].select ? "WAITING..." : `${myName}: SELECT CARD`;
        }

        ctx.fillStyle = '#ff5555';
        ctx.fillText(msgTop, cvs.width / 2, cvs.height * 0.2);

        ctx.fillStyle = '#00f2ff';
        ctx.fillText(msgBottom, cvs.width / 2, cvs.height * 0.6);

        this.createHandButtons();
    },

    createHandButtons() {
        const layer = document.querySelector('.ui-overlay');
        const old = document.getElementById('calc-hand-container');
        if (old) old.remove();

        const container = document.createElement('div');
        container.id = 'calc-hand-container';
        container.style.cssText = `
            position: absolute; bottom: 15%; width: 100%;
            display: flex; justify-content: center; gap: 5px; flex-wrap: wrap;
            pointer-events: auto; z-index: 150; padding: 0 10px;
        `;
        
        let currentHand = [];
        let isMyTurn = false;

        if (this.mode === 'local') {
            currentHand = this[this.localTurn].hand;
            isMyTurn = true;
            // ローカル対戦時、P2のターンなら手札を上部に逆さまに表示
            if (this.localTurn === 'p2') {
                container.style.top = '15%';
                container.style.bottom = 'auto';
                container.style.transform = 'rotate(180deg)';
            }
        } else {
            currentHand = this[this.role].hand;
            isMyTurn = !this[this.role].select;
        }

        currentHand.forEach(val => {
            const btn = document.createElement('div');
            btn.className = 'card';
            btn.innerText = val;
            btn.style.cursor = 'pointer';
            
            if (!isMyTurn) {
                btn.classList.add('disabled');
                btn.style.opacity = 0.5;
            } else {
                btn.onclick = () => {
                    Shared.Sound.preset('select');
                    this.onCardSelect(val);
                };
            }
            container.appendChild(btn);
        });

        layer.appendChild(container);
    },

    onCardSelect(val) {
        // カード選択処理
        if (this.mode === 'local') {
            this[this.localTurn].select = val;
            if (this.localTurn === 'p1') {
                this.localTurn = 'p2';
                Shared.UI.msg("P2の番です");
                this.updateBoardUI(); 
            } else {
                this.resolvePhase();
            }
        } 
        else if (this.mode === 'npc') {
            this.p1.select = val;
            // CPUはランダム
            const cpuHand = this.p2.hand;
            this.p2.select = cpuHand[Math.floor(Math.random() * cpuHand.length)];
            this.resolvePhase();
        }
        else {
            this[this.role].select = val;
            Shared.Net.send('select', val);
            Shared.UI.msg("相手を待っています...");
            this.updateBoardUI();
            
            const oppRole = this.role === 'p1' ? 'p2' : 'p1';
            if (this[oppRole].select !== null) {
                this.resolvePhase();
            }
        }
    },

    autoSelect() {
        if (this.mode === 'local') {
            if (!this.p1.select) this.p1.select = this.p1.hand[0];
            if (!this.p2.select) this.p2.select = this.p2.hand[0];
            this.resolvePhase();
        } else {
            if (!this[this.role].select) {
                this.onCardSelect(this[this.role].hand[0]);
            }
        }
    },

    // --- フェーズ2: カード公開 ---
    resolvePhase() {
        clearInterval(this.timerId);
        
        const handContainer = document.getElementById('calc-hand-container');
        if (handContainer) handContainer.style.display = 'none';

        const cvs = document.getElementById('main-cvs');
        const ctx = cvs.getContext('2d');
        
        ctx.fillStyle = '#000'; 
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        
        const fs = Math.floor(cvs.width / 4);
        ctx.font = `bold ${fs}px 'Orbitron'`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 画面描画
        ctx.fillStyle = '#ff5555';
        ctx.fillText(this.p2.select, cvs.width / 2, cvs.height * 0.25);
        
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${fs/3}px sans-serif`;
        ctx.fillText("VS", cvs.width / 2, cvs.height * 0.5);

        ctx.fillStyle = '#00f2ff';
        ctx.font = `bold ${fs}px 'Orbitron'`;
        ctx.fillText(this.p1.select, cvs.width / 2, cvs.height * 0.75);

        // 同じ数字なら両者ダメージ
         if (this.p1.select === this.p2.select) {
            Shared.UI.msg("CRASH!!", "#ffd700");
            Shared.Sound.preset('hit');
            Shared.VFX.shake('hard'); // ★VFX演出
            Shared.VFX.flash();       // ★VFX演出
            setTimeout(() => {
                if (!this.isPlaying) return; // ★中断時対策
                this.endRound(true, true);
            }, 2000);
        } else {
            setTimeout(() => {
                if (!this.isPlaying) return; // ★中断時対策
                this.startCalcPhase(this.attacker);
            }, 1500);
        }
    },

    // --- フェーズ3: 計算 ---
    startCalcPhase(atk) {
        this.phase = 'calc';
        const isAttacker = (this.mode === 'local') || (this.role === atk);
        
        const target = (atk === 'p1') ? this.p2.select : this.p1.select;
        const baseCard = (atk === 'p1') ? this.p1.select : this.p2.select;

        Shared.UI.updateHUD(
            this.attacker === 'p1' ? "ATTACK" : "DEFEND", 
            this.attacker === 'p2' ? "ATTACK" : "DEFEND", 
            ""
        );

        if (isAttacker) {
            this.buffer = [baseCard]; 
            document.getElementById('calc-target').innerText = target;
            
            // ローカル対戦でP2が攻撃側の場合はパネルを反転
            const panel = document.getElementById('ui-calc');
            if (this.mode === 'local' && atk === 'p2') {
                panel.classList.add('p2-mode');
            } else {
                panel.classList.remove('p2-mode');
            }
            
            Shared.UI.toggleLayout('ui-calc', true); 
            Shared.UI.msg(this.mode==='local' ? `${atk.toUpperCase()}の計算` : "計算して相手の数字を作れ！");
            
            this.renderCalcButtons();
            this.startTimer(40, () => this.pass()); 

        } else if (this.mode === 'npc' && atk === 'p2') {
            Shared.UI.msg("CPUが計算中...", "#ff5555");
            setTimeout(() => {
                if (!this.isPlaying) return; // ★中断時対策
                // NPCロジック (成功率50%)
                const success = Math.random() < 0.5;
                if(success) {
                    Shared.UI.msg("BREAK SUCCESS!", "#ffd700");
                    Shared.Sound.preset('dead'); // P1視点ではダメージ音
                    this.endRound(true, true); 
                } else {
                    Shared.UI.msg("GUARDED!", "#aaa");
                    this.pass();
                }
            }, 2000);
        } else {
            Shared.UI.msg("相手の計算を待っています...", "#ff5555");
        }
    },

    renderCalcButtons() {
        document.getElementById('calc-disp').innerText = this.buffer.join(' ');
        
        const chipsDiv = document.getElementById('calc-chips');
        chipsDiv.innerHTML = '';
        ['+', '-', '*', '/'].forEach(op => {
            const btn = document.createElement('div');
            btn.className = 'chip';
            btn.style.cssText = "width:50px; height:50px; background:#eee; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:1.5rem; cursor:pointer; border:2px solid #ccc; color:#333;";
            btn.innerText = op;
            btn.onclick = () => { 
                this.buffer.push(op); 
                this.renderCalcButtons(); 
                Shared.Sound.preset('select'); 
            };
            chipsDiv.appendChild(btn);
        });

        const handDiv = document.getElementById('calc-hand');
        handDiv.innerHTML = '';
        const currentHand = this[this.attacker].hand;
        
        currentHand.forEach(val => {
            const btn = document.createElement('div');
            btn.className = 'card';
            btn.style.cssText = "width:40px; height:60px; background:#fff; border:2px solid #00f2ff; border-radius:5px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:1.2rem; cursor:pointer; color:#333;";
            btn.innerText = val;
            
            // 使用制限: 手札にある枚数以上に式に入れていないかチェック
            // ※ buffer[0] は場のカードなので手札消費カウントには含めない
            const inHandCount = currentHand.filter(x => x === val).length;
            const usedInBuffer = this.buffer.slice(1).filter(x => x === val).length;
            
            if (usedInBuffer >= inHandCount) {
                btn.style.opacity = "0.3"; 
                btn.style.pointerEvents = "none";
                btn.style.background = "#ddd";
            } else {
                btn.onclick = () => {
                    this.buffer.push(val);
                    this.renderCalcButtons();
                    Shared.Sound.preset('select');
                };
            }
            handDiv.appendChild(btn);
        });

        document.getElementById('c-clear').onclick = () => { 
            this.buffer = [ (this.attacker==='p1' ? this.p1.select : this.p2.select) ]; 
            this.renderCalcButtons(); 
        };
        document.getElementById('c-pass').onclick = () => this.pass();
        document.getElementById('c-go').onclick = () => this.submit();
    },

    submit() {
        try {
            const exp = this.buffer.join('');
            if (/[^0-9+\-*/]/.test(exp)) throw "Invalid";
            if (exp.includes('/0')) throw "Zero";
            
            const result = Function('"use strict";return (' + exp + ')')();
            const target = (this.attacker === 'p1') ? this.p2.select : this.p1.select;
            
             if (result === target) {
                Shared.Sound.preset('win');
                Shared.UI.msg("BREAK SUCCESS!!", "#ffd700");
                Shared.VFX.shake('light'); // ★VFX演出
                Shared.VFX.flash();        // ★VFX演出
                if (this.mode.includes('online')) Shared.Net.send('result', {success: true, buffer: this.buffer});
                // 成功: 相手は場のカード喪失、自分は場のカード＋計算コスト喪失
                this.endRound(true, true);
            } else {
                Shared.UI.msg(`WRONG... (${result})`, "#f00");
                Shared.Sound.preset('dead');
            }
        } catch(e) { Shared.UI.msg("ERROR"); }
    },

    pass() {
        Shared.UI.toggleLayout('ui-calc', false);
        Shared.UI.msg("PASS...", "#aaa");
        
        if (this.mode.includes('online')) Shared.Net.send('result', {success: false});
        // 失敗: 攻撃側(Attacker)は場のカードを戻す(Loseフラグfalse)。守備側は場のカードを捨てる(Loseフラグtrue)
        // ※ ルール: パスしたら「守備側だけ」カードを捨てる、攻撃側のカードは手札に戻る
        const p1Lose = (this.attacker === 'p2');
        const p2Lose = (this.attacker === 'p1');
        this.endRound(p1Lose, p2Lose);
    },

    // --- ラウンド終了処理 ---
    endRound(p1Lose, p2Lose) {
        Shared.UI.toggleLayout('ui-calc', false);
        
        // カード削除処理
        if (p1Lose) {
            // 場に出したカードを削除
            const idx = this.p1.hand.indexOf(this.p1.select);
            if (idx > -1) this.p1.hand.splice(idx, 1);
            
            // 攻撃成功時（かつ自分が攻撃側なら）、計算に使った手札コストも削除
            if (this.attacker === 'p1' && p2Lose) {
                 this.payCost('p1');
            }
        }
        if (p2Lose) {
            const idx = this.p2.hand.indexOf(this.p2.select);
            if (idx > -1) this.p2.hand.splice(idx, 1);
            
            if (this.attacker === 'p2' && p1Lose) {
                 this.payCost('p2');
            }
        }

        this.updateHUD();

        // 勝利判定
        if (this.p1.hand.length === 0) return this.end("P1 WIN!");
        if (this.p2.hand.length === 0) return this.end("P2 WIN!");

        // 攻守交代
        this.attacker = this.attacker === 'p1' ? 'p2' : 'p1';
        
        // 次のターンへ
        setTimeout(() => {
            if (this.isPlaying) this.startSelectPhase();
        }, 2000);
    },

    // コスト支払い（バッファに含まれるカードを手札から消す）
    payCost(pl) {
        // spliceによる配列破壊を避け、新しい手札配列を生成する安全な方法
        let currentHand = [...this[pl].hand];
        
        for(let i=1; i<this.buffer.length; i++) {
            const val = this.buffer[i];
            if (typeof val === 'number') {
                const idx = currentHand.indexOf(val);
                if (idx > -1) {
                    currentHand.splice(idx, 1);
                }
            }
        }
        this[pl].hand = currentHand;
    },

    updateHUD() {
        Shared.UI.updateHUD(`P1: ${this.p1.hand.length}枚`, `P2: ${this.p2.hand.length}枚`);
    },

    onNet(d) {
        if (d.type === 'select') {
            const opp = this.role === 'p1' ? this.p2 : this.p1;
            opp.select = d.payload;
            if (this.p1.select !== null && this.p2.select !== null) this.resolvePhase();
        }
        if (d.type === 'result') {
            if (d.payload.success) {
                this.buffer = d.payload.buffer; // 相手の式をコピー(コスト計算用)
                this.endRound(true, true);
            } else {
                this.endRound(this.attacker === 'p2', this.attacker === 'p1');
            }
        }
    },

    startTimer(sec, cb) {
        clearInterval(this.timerId);
        const el = document.getElementById('game-timer');
        el.style.display = 'block';
        this.timer = sec;
        el.innerText = this.timer;
        
        this.timerId = setInterval(() => {
            this.timer--;
            el.innerText = this.timer;
            if (this.timer <= 0) {
                clearInterval(this.timerId);
                cb();
            }
        }, 1000);
    },

    end(m) {
        this.isPlaying = false;
        clearInterval(this.timerId);
        document.getElementById('game-timer').style.display = 'none';
        Shared.UI.show('screen-result');
        document.getElementById('res-title').innerText = m;
        document.getElementById('res-detail').innerText = "";
    }
};

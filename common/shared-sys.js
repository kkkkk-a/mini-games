/**
 * Neo Tactics Shared System v5.0 (Final Optimized)
 * 役割: 全ゲーム共通の「音・入力・通信・画面遷移」を一括管理するエンジン
 */

// --- ブラウザ特有のジェスチャー（引っ張って更新、スワイプ戻る）を無効化 ---
document.addEventListener('touchmove', function(e) {
    // ヘルプ画面など、意図的にスクロールさせたい場所は許可
    if (e.target.closest('#help-content')) return;
    e.preventDefault();
}, { passive: false });

window.Shared = {
        stop() {
        this.isPlaying = false;
        
        // アニメーションループ停止
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Three.jsのリソース解放 (メモリリーク防止)
        if (this.renderer) {
            this.renderer.dispose();
            // DOMからキャンバスを削除しないと、次にinitしたときにgetContextエラーになる場合があるため
            // init()側で「既存キャンバス削除」処理が入っていればOKですが、念のためここでも掃除可能です
        }
        
        // UI非表示
        const rpsUI = document.getElementById('ui-rps');
        if(rpsUI) rpsUI.style.display = 'none';

        const turnArea = document.getElementById('turn-display-area');
        if(turnArea) turnArea.style.display = 'none';
    },
    // --- 1. UI管理システム ---
    UI: {
        // 画面を切り替える（ID指定）
        show(id) {
            // 全てのスクリーン・モーダルを一旦非表示にする
            document.querySelectorAll('.screen, .modal').forEach(el => {
                el.classList.remove('active');
                // modalクラスの場合は display:none も念のため適用（CSS競合対策）
                if (el.classList.contains('modal')) el.style.display = 'none';
            });

            // 指定されたIDの要素を表示
            const target = document.getElementById(id);
            if (target) {
                target.classList.add('active');
                // モーダルなら flex 表示を強制（CSSの display:none を上書き）
                if (target.classList.contains('modal')) target.style.display = 'flex';
            } else {
                console.error(`UI Error: Element #${id} not found.`);
            }
        },


            updateHUD(p1Val, p2Val, centerMsg = "") {
            const h1 = document.getElementById('hud-p1');
            const h2 = document.getElementById('hud-p2');
            const hc = document.getElementById('hud-center');
            
            if (h1) h1.innerText = p1Val;
            if (h2) h2.innerText = p2Val;
            if (hc) hc.innerText = centerMsg;
        },

        // ゲーム内のUIパーツ（十字キーなど）の表示/非表示
        toggleLayout(id, show) {
            const el = document.getElementById(id);
            if (el) {
                if (show) el.classList.add('active');
                else el.classList.remove('active');
            }
        },

        // 画面中央に一時的なメッセージを表示
        msg(txt, color='#fff') {
            const el = document.getElementById('game-guide'); // index.htmlにある前提
            if (el) {
                el.innerText = txt;
                el.style.color = color;
                el.style.display = 'block';
                // 1.5秒後に消す
                setTimeout(() => { el.style.display = 'none'; }, 1500);
            }
        }
    },

    VFX: {
        stopUntil: 0,
        
        // 画面揺れ (light / hard)
        shake(intensity = 'light') {
            const el = document.getElementById('game-container');
            if (!el) return;
            const className = 'vfx-shake-' + intensity;
            
            // アニメーションを再トリガーするためのリセット
            el.classList.remove('vfx-shake-light', 'vfx-shake-hard');
            void el.offsetWidth; // リフロー強制
            
            el.classList.add(className);
            setTimeout(() => el.classList.remove(className), 500);
        },

        // ヒットストップ (指定ミリ秒だけゲームの物理演算を止める)
        hitStop(ms) {
            this.stopUntil = performance.now() + ms;
        },

        // 現在ヒットストップ中かどうか
        isStopped() {
            return performance.now() < this.stopUntil;
        },

        // フラッシュ (画面一閃)
        flash() {
            const container = document.getElementById('game-container');
            if (!container) return;
            let overlay = document.getElementById('vfx-flash-div');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'vfx-flash-div';
                container.appendChild(overlay);
            }
            // アニメーションのリセット
            overlay.className = '';
            void overlay.offsetWidth; 
            overlay.className = 'vfx-flash-overlay';
        }
    },

    // --- 2. 音響システム (Web Audio API) ---
    Sound: {
        ctx: null,
        
        // AudioContextの初期化（ユーザー操作時に呼ぶこと）
        init() {
            if (!this.ctx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioContext();
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(e => console.log(e));
            }
        },

        // 任意の音を生成して鳴らす（周波数, 波形タイプ, 長さ, 音量）
        play(freq, type = 'sine', duration = 0.2, vol = 0.1) {
            // 初期化されていなければ試みる
            if (!this.ctx) this.init();
            if (!this.ctx) return; 

            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, t);

            // 音量の減衰エンベロープ（プチッというノイズ防止）
            gain.gain.setValueAtTime(vol, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(t + duration);
        },

        // よく使う効果音のプリセット
        preset(name) {
            if (name === 'ok' || name === 'select') this.play(880, 'sine', 0.1, 0.1);
            if (name === 'cancel') this.play(220, 'square', 0.1, 0.1);
            if (name === 'hit' || name === 'place') this.play(440, 'square', 0.05, 0.1);
            if (name === 'dead' || name === 'lose') this.play(110, 'sawtooth', 0.4, 0.2);
            if (name === 'win') {
                // 勝利ファンファーレ
                [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
                    setTimeout(() => this.play(f, 'triangle', 0.3, 0.2), i * 100);
                });
            }
        }
    },

    // --- 3. 入力管理システム (Pointer Events & Keyboard) ---
    Input: {
        state: { 
            touchX: null, touchY: null // スワイプ座標用
        },
        
        // キーバインドの初期化
        // bindings = { 'HTML_ID': 'STATE_NAME', 'KEY_CODE': 'STATE_NAME' }
        init(bindings) {
            // ステートのリセット
            this.state = { touchX: null, touchY: null };

            // キーボード入力の監視
            window.onkeydown = (e) => {
                const action = bindings[e.code];
                if (action) {
                    this.state[action] = true;
                    // ゲーム操作キーならブラウザのスクロール等を防ぐ
                    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
                        e.preventDefault();
                    }
                }
            };
            window.onkeyup = (e) => {
                const action = bindings[e.code];
                if (action) this.state[action] = false;
            };

            // HTMLボタンへのイベント付与 (Pointer EventsでPC/スマホ両対応)
            Object.keys(bindings).forEach(key => {
                // keyがHTML要素のIDと一致する場合
                const el = document.getElementById(key);
                if (el) {
                    const action = bindings[key];
                    
                    // 押した瞬間
                    el.onpointerdown = (e) => {
                        e.preventDefault();
                        el.setPointerCapture(e.pointerId); // 指がボタンから外れても反応を維持
                        el.classList.add('active'); // 見た目のフィードバック
                        this.state[action] = true;
                        
                        // スマホでの初回タッチ時に音響システムを目覚めさせる
                        Shared.Sound.init(); 
                    };

                    // 離した瞬間 / キャンセル時
                    const reset = (e) => {
                        e.preventDefault();
                        el.releasePointerCapture(e.pointerId);
                        el.classList.remove('active');
                        this.state[action] = false;
                    };
                    
                    el.onpointerup = reset;
                    el.onpointercancel = reset;
                }
            });

             // キャンバスのスワイプ座標取得 (マルチタッチ対応)
            const cvs = document.getElementById('main-cvs');
            if (cvs) {
                this.state.activeTouches = new Map();
                
                const updatePos = (e) => {
                    if (e.buttons > 0 || e.pointerType === 'touch') {
                        const rect = cvs.getBoundingClientRect();
                        const scaleX = cvs.width / rect.width;
                        const scaleY = cvs.height / rect.height;
                        this.state.activeTouches.set(e.pointerId, {
                            x: (e.clientX - rect.left) * scaleX,
                            y: (e.clientY - rect.top) * scaleY
                        });
                    }
                };
                
                cvs.onpointerdown = (e) => {
                    e.preventDefault(); // スクロール防止
                    Shared.Sound.init();
                    cvs.setPointerCapture(e.pointerId);
                    updatePos(e);
                };
                cvs.onpointermove = (e) => {
                    if (this.state.activeTouches.has(e.pointerId)) updatePos(e);
                };
                const removePos = (e) => {
                    this.state.activeTouches.delete(e.pointerId);
                };
                cvs.onpointerup = removePos;
                cvs.onpointercancel = removePos;
            }
        }
    },

    // --- 4. ネットワークシステム (PeerJS & QR) ---
    Net: {
        peer: null,
        conn: null,
        role: null, // 'host' or 'guest'
        scanner: null,
        
        // 外部から設定するコールバック関数
        onConnect: null,
        onData: null,

        // 送信間引き用タイムスタンプ
        lastSendTime: 0,

        // ホストとして開始
        host() {
            this.role = 'host';
            Shared.UI.show('screen-net');
            // 画面パーツの切り替え
            this._toggleNetUI('host');

            Shared.Sound.init();

            this.peer = new Peer();
            this.peer.on('open', id => {
                const idText = document.getElementById('host-id-text');
                if(idText) idText.innerText = id;
                
                // QRコード生成
                const qrArea = document.getElementById("qr-area");
                if(qrArea) {
                    qrArea.innerHTML = "";
                    new QRCode(qrArea, { text: id, width: 150, height: 150 });
                }
            });
            this.peer.on('connection', c => {
                this.conn = c;
                this._setupConn();
            });
            this.peer.on('error', err => {
                console.error(err);
                alert("通信エラー: " + err.type);
            });
        },

        // ゲスト画面を表示
        showGuest() {
            this._toggleNetUI('guest');
        },

        // カメラ起動 (QRスキャン)
        startCam() {
            const wrapper = document.getElementById('cam-wrapper');
            if(wrapper) wrapper.style.display = 'block';
            
            Shared.Sound.init();

            if (typeof Html5QrcodeScanner !== 'undefined') {
                this.scanner = new Html5QrcodeScanner("cam-wrapper", { fps: 10, qrbox: 200 });
                this.scanner.render((decodedText) => {
                    this.join(decodedText);
                    this.scanner.clear();
                    if(wrapper) wrapper.style.display = 'none';
                }, (err) => { /* 読み取り中のエラーは無視 */ });
            } else {
                alert("QRスキャナーライブラリが見つかりません");
            }
        },

        // ID手入力で参加
        joinInput() {
            const input = document.getElementById('join-id');
            if (input && input.value) {
                this.join(input.value);
            }
        },

        // 接続処理
        join(id) {
            this.role = 'guest';
            Shared.Sound.init();
            
            this.peer = new Peer();
            this.peer.on('open', () => {
                this.conn = this.peer.connect(id);
                this._setupConn();
            });
            this.peer.on('error', err => {
                alert("接続失敗: IDを確認してください");
            });
        },

        // 接続確立後の共通設定
        _setupConn() {
            if (!this.conn) return;
            
            this.conn.on('open', () => {
                console.log("Connected as " + this.role);
                if (this.onConnect) this.onConnect();
            });
            
            this.conn.on('data', data => {
                if (this.onData) this.onData(data);
            });
            
            this.conn.on('close', () => {
                alert("対戦相手が切断しました");
                location.reload();
            });
        },

        // データ送信（最適化済み）
        // force=trueにすると間引きを無視して即時送信（ゲーム終了時などに使用）
        send(type, payload, force = false) {
            if (this.conn && this.conn.open) {
                const now = performance.now();
                // 33ms (約30fps) 以内の連続送信をスキップして通信負荷を下げる
                if (!force && now - this.lastSendTime < 33) return;
                
                this.lastSendTime = now;
                this.conn.send({ type, payload });
            }
        },

        // UI切り替えヘルパー
        _toggleNetUI(mode) {
            const initUi = document.getElementById('net-init');
            const hostUi = document.getElementById('net-host-ui');
            const guestUi = document.getElementById('net-guest-ui');
            if(initUi) initUi.style.display = 'none';
            if(hostUi) hostUi.style.display = (mode === 'host' ? 'flex' : 'none');
            if(guestUi) guestUi.style.display = (mode === 'guest' ? 'flex' : 'none');
        }
    },

};

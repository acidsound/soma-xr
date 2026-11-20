import type {
  AvatarRuntimeStatus,
  GazeMode,
  PersonaProfile,
  PlaygroundCommandType,
  RelationshipState,
  SomaMotionStyle,
  SomaRuntimeStatus,
  UserEmotionAnalysis,
} from '../types';
import {
  PERSONAS,
  PLAYGROUND_QUICK_COMMANDS,
  SOMA_STYLE_LABELS,
} from '../constants';
import {
  clearLocalApiConfig,
  loadLocalApiConfig,
  saveLocalApiConfig,
} from '../services/localApiConfig';

export interface HudCallbacks {
  onStartGame: () => void;
  onPauseToggle: () => void;
  onResetRelationship: () => void;
  onResetPlayground: () => void;
  onReturnTitle: () => void;
  onSendMessage: (text: string) => void;
  onTriggerPlaygroundCommand: (
    command: PlaygroundCommandType,
    promptText?: string,
  ) => void;
  onToggleObstacleClickMode: () => void;
  onToggleVoiceRecording: () => void;
  onToggleTts: () => void;
  onToggleGazeTracking: () => void;
  onToggleWebcamGaze: () => void;
  onChangeGazeMode: (mode: GazeMode) => void;
  onSelectSomaStyle: (style: SomaMotionStyle) => void;
  onSelectPersona: (personaId: string) => void;
  onLoadVrmFile: (file: File) => void;
  onResetVrm: () => void;
  onLoadCloudOnnx: () => void;
  onLoadOnnxFile: (file: File) => void;
  onResetOnnx: () => void;
  onToggleSpatialCard: () => void;
  onEnterXR: () => void;
}

export class SandboxHud {
  private root: HTMLElement;
  private callbacks: HudCallbacks;

  private titleOverlay!: HTMLElement;
  private playingHud!: HTMLElement;
  private pauseModal!: HTMLElement;
  private settingsModal!: HTMLElement;

  private apiEndpointInput!: HTMLInputElement;
  private apiModelInput!: HTMLInputElement;
  private apiKeyInput!: HTMLInputElement;
  private apiSettingsStatusEl!: HTMLElement;

  // Dynamic elements
  private personaBadgeEl!: HTMLElement;
  private stageBadgeEl!: HTMLElement;
  private affectionValEl!: HTMLElement;
  private affectionBarEl!: HTMLElement;
  private trustValEl!: HTMLElement;
  private trustBarEl!: HTMLElement;
  private moodValEl!: HTMLElement;
  private moodBarEl!: HTMLElement;
  private emotionBadgeEl!: HTMLElement;
  private somaBadgeEl!: HTMLElement;
  private activityBadgeEl!: HTMLElement;

  private replyBoxEl!: HTMLElement;
  private replySpeakerEl!: HTMLElement;
  private replyTextEl!: HTMLElement;
  private innerThoughtEl!: HTMLElement;
  private errorBannerEl!: HTMLElement;

  private chatInputEl!: HTMLInputElement;
  private sendBtnEl!: HTMLButtonElement;
  private micBtnEl!: HTMLButtonElement;
  private choicesRowEl!: HTMLElement;

  private dockEl!: HTMLElement;
  private dockBodyEl!: HTMLElement;
  private collapseBtnEl!: HTMLButtonElement;
  private dockCollapsed = false;
  private activeTab: 'chat' | 'motion' | 'gaze' = 'chat';

  private clickModeBtnEl!: HTMLButtonElement;
  private ttsBtnEl!: HTMLButtonElement;
  private gazeBtnEl!: HTMLButtonElement;
  private webcamGazeBtnEl!: HTMLButtonElement;
  private spatialCardBtnEl!: HTMLButtonElement;
  private cloudOnnxBtnEl!: HTMLButtonElement;

  private vrmStatusEl!: HTMLElement;
  private onnxStatusEl!: HTMLElement;
  private gazeModeSelectEl!: HTMLSelectElement;

  private tabButtons: Record<'chat' | 'motion' | 'gaze', HTMLButtonElement> =
    {} as Record<'chat' | 'motion' | 'gaze', HTMLButtonElement>;
  private tabPanels: Record<'chat' | 'motion' | 'gaze', HTMLElement> =
    {} as Record<'chat' | 'motion' | 'gaze', HTMLElement>;
  private somaStyleButtons = new Map<SomaMotionStyle, HTMLButtonElement>();
  private personaButtons = new Map<string, HTMLButtonElement>();

  constructor(container: HTMLElement, callbacks: HudCallbacks) {
    this.root = container;
    this.callbacks = callbacks;
    this.render();
    this.bindGlobalKeys();
  }

  private render(): void {
    this.root.innerHTML = '';

    // 1. TITLE SCREEN OVERLAY
    this.titleOverlay = document.createElement('section');
    this.titleOverlay.className = 'sh-title-overlay';
    this.titleOverlay.setAttribute('aria-label', '타이틀 화면');
    this.titleOverlay.innerHTML = `
      <div class="sh-title-panel">
        <svg class="sh-emblem" viewBox="0 0 265 54" width="265" height="54" aria-hidden="true">
          <defs>
            <linearGradient id="shEmblemGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#f9a8d4" />
              <stop offset="55%" stop-color="#e879f9" />
              <stop offset="100%" stop-color="#60a5fa" />
            </linearGradient>
          </defs>
          <path d="M24 38 C14 30, 8 23, 8 16 C8 10.5, 12.5 7, 17.5 7 C20.8 7, 23 8.8, 24 11 C25 8.8, 27.2 7, 30.5 7 C35.5 7, 40 10.5, 40 16 C40 23, 34 30, 24 38 Z" fill="url(#shEmblemGrad)" />
          <circle cx="24" cy="20" r="3.2" fill="#18122b" />
          <text x="54" y="29" fill="#fdf4ff" font-size="22" font-weight="700" letter-spacing="0.05em" font-family="'Google Sans', sans-serif">SOMA·HEART</text>
          <text x="55" y="45" fill="#d8b4fe" font-size="10.5" font-weight="500" letter-spacing="0.14em" font-family="'Google Sans', sans-serif">MOTIONBRICKS PLAYGROUND XR</text>
        </svg>
        <h1 class="sh-title-heading">SOMA 모션과 감정이 살아 숨 쉬는<br/>인터랙티브 놀이터 샌드박스</h1>
        <p class="sh-title-desc">
          미끄럼틀·그네·시소·벤치·3단 뜀틀·축구공·농구공·샌드박스에서 <strong>mech_girl.vrm</strong> 아바타를 클릭이나 지시어로 움직이고, MotionBricks SOMA 모션·감정 LLM·음성 대화를 시험해 보세요.
        </p>
        <div class="sh-title-actions">
          <button type="button" class="sh-primary-cta" data-start="true" data-testid="start-btn">
            놀이터 입장하기
          </button>
          <button type="button" class="sh-secondary-cta" data-testid="title-xr-btn">
            WebXR / 시뮬레이터 열기
          </button>
        </div>
        <p class="sh-title-hint">바닥·기구 클릭으로 이동/상호작용 · 우클릭 드래그로 카메라 회전 · Enter로 시작</p>
      </div>
    `;
    this.root.appendChild(this.titleOverlay);

    const startBtn = this.titleOverlay.querySelector<HTMLButtonElement>('[data-start="true"]');
    startBtn?.addEventListener('click', (e) => {
      e.currentTarget && (e.currentTarget as HTMLButtonElement).blur();
      this.callbacks.onStartGame();
    });
    const titleXrBtn = this.titleOverlay.querySelector<HTMLButtonElement>(
      '[data-testid="title-xr-btn"]',
    );
    titleXrBtn?.addEventListener('click', () => {
      this.callbacks.onStartGame();
      this.callbacks.onEnterXR();
    });

    // 2. PLAYING HUD (pointer-events: none wrapper, interactive children only)
    this.playingHud = document.createElement('div');
    this.playingHud.className = 'sh-hud-layer';

    // Top bar: Left bond cluster + Right compact utility buttons
    const topBar = document.createElement('div');
    topBar.className = 'sh-top-bar';

    const bondCluster = document.createElement('div');
    bondCluster.className = 'sh-bond-cluster';
    bondCluster.innerHTML = `
      <div class="sh-bond-head">
        <span class="sh-persona-name" data-testid="persona-name">서연</span>
        <span class="sh-stage-pill" data-testid="relationship-stage">낯선 만남</span>
      </div>
      <div class="sh-meters">
        <div class="sh-meter">
          <span class="sh-meter-kicker">호감</span>
          <div class="sh-meter-track"><div class="sh-meter-fill sh-fill-pink" data-bar="affection"></div></div>
          <span class="sh-meter-val" data-val="affection">32</span>
        </div>
        <div class="sh-meter">
          <span class="sh-meter-kicker">신뢰</span>
          <div class="sh-meter-track"><div class="sh-meter-fill sh-fill-sky" data-bar="trust"></div></div>
          <span class="sh-meter-val" data-val="trust">28</span>
        </div>
        <div class="sh-meter">
          <span class="sh-meter-kicker">기분</span>
          <div class="sh-meter-track"><div class="sh-meter-fill sh-fill-amber" data-bar="mood"></div></div>
          <span class="sh-meter-val" data-val="mood">72</span>
        </div>
      </div>
      <div class="sh-telemetry-row">
        <span class="sh-chip" data-testid="emotion-badge">감정: 평온</span>
        <span class="sh-chip sh-chip-violet" data-testid="soma-badge">SOMA: soma:idle</span>
        <span class="sh-chip sh-chip-emerald" data-testid="activity-badge">놀이터 중앙 대기</span>
      </div>
    `;
    this.personaBadgeEl = bondCluster.querySelector('[data-testid="persona-name"]')!;
    this.stageBadgeEl = bondCluster.querySelector('[data-testid="relationship-stage"]')!;
    this.affectionValEl = bondCluster.querySelector('[data-val="affection"]')!;
    this.affectionBarEl = bondCluster.querySelector('[data-bar="affection"]')!;
    this.trustValEl = bondCluster.querySelector('[data-val="trust"]')!;
    this.trustBarEl = bondCluster.querySelector('[data-bar="trust"]')!;
    this.moodValEl = bondCluster.querySelector('[data-val="mood"]')!;
    this.moodBarEl = bondCluster.querySelector('[data-bar="mood"]')!;
    this.emotionBadgeEl = bondCluster.querySelector('[data-testid="emotion-badge"]')!;
    this.somaBadgeEl = bondCluster.querySelector('[data-testid="soma-badge"]')!;
    this.activityBadgeEl = bondCluster.querySelector('[data-testid="activity-badge"]')!;

    const utilCluster = document.createElement('div');
    utilCluster.className = 'sh-util-cluster';

    this.clickModeBtnEl = this.createUtilButton(
      '벤치/시소 클릭: 앉기',
      'obstacle-click-mode-btn',
      () => this.callbacks.onToggleObstacleClickMode(),
    );
    this.ttsBtnEl = this.createUtilButton('TTS OFF', 'tts-toggle', () => this.callbacks.onToggleTts());
    this.gazeBtnEl = this.createUtilButton('시선 ON', 'gaze-toggle', () =>
      this.callbacks.onToggleGazeTracking(),
    );
    this.spatialCardBtnEl = this.createUtilButton('XR 카드', 'spatial-card-toggle', () =>
      this.callbacks.onToggleSpatialCard(),
    );
    const xrBtn = this.createUtilButton('XR 모드', 'enter-xr-btn', () =>
      this.callbacks.onEnterXR(),
    );
    const apiSettingsBtn = this.createUtilButton(
      'API 설정',
      'api-settings-btn',
      () => this.openApiSettings(),
    );
    const pauseBtn = this.createUtilButton('메뉴 [P]', 'pause-btn', () =>
      this.callbacks.onPauseToggle(),
    );
    utilCluster.append(
      this.clickModeBtnEl,
      this.ttsBtnEl,
      this.gazeBtnEl,
      this.spatialCardBtnEl,
      xrBtn,
      apiSettingsBtn,
      pauseBtn,
    );

    topBar.append(bondCluster, utilCluster);
    this.playingHud.appendChild(topBar);

    // Bottom anchor wrapper (Dialogue Caption + Collapsible Dock)
    const bottomAnchor = document.createElement('div');
    bottomAnchor.className = 'sh-bottom-anchor';

    this.errorBannerEl = document.createElement('div');
    this.errorBannerEl.className = 'sh-error-banner';
    this.errorBannerEl.hidden = true;
    this.errorBannerEl.setAttribute('role', 'alert');
    bottomAnchor.appendChild(this.errorBannerEl);

    this.replyBoxEl = document.createElement('div');
    this.replyBoxEl.className = 'sh-reply-box';
    this.replyBoxEl.innerHTML = `
      <div class="sh-reply-header">
        <span class="sh-reply-speaker" data-testid="reply-speaker">서연</span>
        <span class="sh-reply-thought" data-testid="inner-thought"></span>
      </div>
      <p class="sh-reply-text" data-testid="npc-reply">안녕! 오늘 놀이터 날씨가 정말 좋다. 바닥이나 기구를 클릭하거나 말로 지시해 줘!</p>
    `;
    this.replySpeakerEl = this.replyBoxEl.querySelector('[data-testid="reply-speaker"]')!;
    this.innerThoughtEl = this.replyBoxEl.querySelector('[data-testid="inner-thought"]')!;
    this.replyTextEl = this.replyBoxEl.querySelector('[data-testid="npc-reply"]')!;
    bottomAnchor.appendChild(this.replyBoxEl);

    // Collapsible Sandbox Dock
    this.dockEl = document.createElement('div');
    this.dockEl.className = 'sh-dock';

    const dockHeader = document.createElement('div');
    dockHeader.className = 'sh-dock-header';

    const tabsWrap = document.createElement('div');
    tabsWrap.className = 'sh-tabs';
    tabsWrap.setAttribute('role', 'tablist');
    const tabDefs: Array<{ id: 'chat' | 'motion' | 'gaze'; label: string }> = [
      { id: 'chat', label: '놀이터 지시 · 대화' },
      { id: 'motion', label: 'SOMA · VRM 모델' },
      { id: 'gaze', label: '시선 · 페르소나' },
    ];
    for (const def of tabDefs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sh-tab-btn';
      btn.textContent = def.label;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', def.id === 'chat' ? 'true' : 'false');
      btn.dataset.testid = `tab-${def.id}`;
      btn.addEventListener('click', () => this.switchTab(def.id));
      this.tabButtons[def.id] = btn;
      tabsWrap.appendChild(btn);
    }

    this.collapseBtnEl = document.createElement('button');
    this.collapseBtnEl.type = 'button';
    this.collapseBtnEl.className = 'sh-collapse-btn';
    this.collapseBtnEl.textContent = '도크 접기 [H]';
    this.collapseBtnEl.dataset.testid = 'dock-collapse-btn';
    this.collapseBtnEl.addEventListener('click', () => this.toggleDockCollapse());

    dockHeader.append(tabsWrap, this.collapseBtnEl);
    this.dockEl.appendChild(dockHeader);

    this.dockBodyEl = document.createElement('div');
    this.dockBodyEl.className = 'sh-dock-body';

    this.buildChatTab();
    this.buildMotionTab();
    this.buildGazePersonaTab();

    this.dockEl.appendChild(this.dockBodyEl);
    bottomAnchor.appendChild(this.dockEl);
    this.playingHud.appendChild(bottomAnchor);
    this.root.appendChild(this.playingHud);

    // 3. PAUSE / MENU MODAL
    this.pauseModal = document.createElement('div');
    this.pauseModal.className = 'sh-modal-backdrop';
    this.pauseModal.innerHTML = `
      <div class="sh-modal-card" role="dialog" aria-modal="true" aria-label="일시정지 메뉴">
        <h2 class="sh-modal-title">SOMA·Heart 놀이터 메뉴</h2>
        <p class="sh-modal-desc">
          • 바닥 클릭: 아바타가 걷거나 달려 이동 (벤치·시소를 가로지르면 자동으로 타넘고 지나감)<br/>
          • 벤치/시소 클릭: 앉기 또는 타넘기 (Shift+클릭 또는 상단 모드 전환)<br/>
          • 축구공·농구공 클릭: 다가가서 발로 차기 / 바운스<br/>
          • 미끄럼틀·샌드박스 클릭: 계단 올라 미끄러지기 / 모래놀이
        </p>
        <div class="sh-modal-actions">
          <button type="button" class="sh-primary-cta" data-action="resume">계속 놀기</button>
          <button type="button" class="sh-secondary-cta" data-action="reset-playground">놀이터 위치 초기화</button>
          <button type="button" class="sh-secondary-cta" data-action="reset">관계 상태 초기화</button>
          <button type="button" class="sh-secondary-cta" data-action="title">타이틀 화면으로</button>
        </div>
      </div>
    `;
    this.pauseModal
      .querySelector('[data-action="resume"]')
      ?.addEventListener('click', () => this.callbacks.onPauseToggle());
    this.pauseModal
      .querySelector('[data-action="reset-playground"]')
      ?.addEventListener('click', () => {
        this.callbacks.onResetPlayground();
        this.callbacks.onPauseToggle();
      });
    this.pauseModal
      .querySelector('[data-action="reset"]')
      ?.addEventListener('click', () => {
        this.callbacks.onResetRelationship();
        this.callbacks.onPauseToggle();
      });
    this.pauseModal
      .querySelector('[data-action="title"]')
      ?.addEventListener('click', () => this.callbacks.onReturnTitle());

    this.root.appendChild(this.pauseModal);

    // 4. LOCAL OPENAI-COMPATIBLE API SETTINGS MODAL
    this.settingsModal = document.createElement('div');
    this.settingsModal.className = 'sh-modal-backdrop';
    this.settingsModal.hidden = true;
    this.settingsModal.innerHTML = `
      <div class="sh-modal-card sh-settings-card" role="dialog" aria-modal="true" aria-label="API 설정">
        <h2 class="sh-modal-title">OpenAI 호환 API 설정</h2>
        <p class="sh-modal-desc">
          Endpoint · Model · API 키는 이 브라우저(localStorage)에만 저장되며 앱 서버로 전송되지 않습니다.
        </p>
        <label class="sh-settings-field">
          <span>API Endpoint</span>
          <input type="text" data-action="endpoint" placeholder="http://localhost:11434/v1" autocomplete="off" spellcheck="false" />
        </label>
        <label class="sh-settings-field">
          <span>Model</span>
          <input type="text" data-action="model" placeholder="예: gpt-4o-mini 또는 llama3" autocomplete="off" spellcheck="false" />
        </label>
        <label class="sh-settings-field">
          <span>API Key</span>
          <input type="password" data-action="api-key" placeholder="로컬에서만 사용할 키" autocomplete="off" spellcheck="false" />
        </label>
        <p class="sh-settings-status" data-action="status" role="status"></p>
        <div class="sh-modal-actions">
          <button type="button" class="sh-primary-cta" data-action="save">브라우저에 저장</button>
          <button type="button" class="sh-secondary-cta" data-action="clear">설정 삭제</button>
          <button type="button" class="sh-secondary-cta" data-action="close">닫기</button>
        </div>
      </div>
    `;
    this.apiEndpointInput = this.settingsModal.querySelector('[data-action="endpoint"]')!;
    this.apiModelInput = this.settingsModal.querySelector('[data-action="model"]')!;
    this.apiKeyInput = this.settingsModal.querySelector('[data-action="api-key"]')!;
    this.apiSettingsStatusEl = this.settingsModal.querySelector('[data-action="status"]')!;
    this.settingsModal
      .querySelector('[data-action="save"]')
      ?.addEventListener('click', () => {
        const endpoint = this.apiEndpointInput.value.trim();
        const model = this.apiModelInput.value.trim();
        const apiKey = this.apiKeyInput.value.trim();
        if (!endpoint || !model || !apiKey) {
          this.apiSettingsStatusEl.textContent =
            'Endpoint, Model, API 키를 모두 입력해 주세요.';
          return;
        }
        saveLocalApiConfig({ endpoint, model, apiKey });
        this.apiSettingsStatusEl.textContent =
          '이 브라우저에 저장했습니다. 서버로 전송되지 않습니다.';
      });
    this.settingsModal
      .querySelector('[data-action="clear"]')
      ?.addEventListener('click', () => {
        clearLocalApiConfig();
        this.apiEndpointInput.value = '';
        this.apiModelInput.value = '';
        this.apiKeyInput.value = '';
        this.apiSettingsStatusEl.textContent = '저장된 설정을 삭제했습니다.';
      });
    this.settingsModal
      .querySelector('[data-action="close"]')
      ?.addEventListener('click', () => {
        this.settingsModal.hidden = true;
      });
    this.root.appendChild(this.settingsModal);

    this.switchTab('chat');
  }

  private openApiSettings(): void {
    const config = loadLocalApiConfig();
    this.apiEndpointInput.value = config?.endpoint ?? '';
    this.apiModelInput.value = config?.model ?? '';
    this.apiKeyInput.value = config?.apiKey ?? '';
    this.apiSettingsStatusEl.textContent = config
      ? '저장된 로컬 설정을 불러왔습니다.'
      : '설정이 없습니다. 저장하면 이 브라우저에서 바로 사용합니다.';
    this.settingsModal.hidden = false;
  }

  private buildChatTab(): void {
    const panel = document.createElement('div');
    panel.className = 'sh-tab-panel';

    this.choicesRowEl = document.createElement('div');
    this.choicesRowEl.className = 'sh-choices-row';

    const form = document.createElement('form');
    form.className = 'sh-chat-form';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = this.chatInputEl.value.trim();
      if (!val) return;
      this.chatInputEl.value = '';
      this.callbacks.onSendMessage(val);
    });

    this.chatInputEl = document.createElement('input');
    this.chatInputEl.type = 'text';
    this.chatInputEl.className = 'sh-chat-input';
    this.chatInputEl.placeholder =
      '대화나 지시어 입력… (예: 벤치 타넘어, 축구공 차줘, 시소 타자, 미끄럼틀 타)';
    this.chatInputEl.setAttribute('aria-label', '대화 및 놀이터 지시어 입력');
    this.chatInputEl.dataset.testid = 'chat-input';

    this.micBtnEl = document.createElement('button');
    this.micBtnEl.type = 'button';
    this.micBtnEl.className = 'sh-mic-btn';
    this.micBtnEl.textContent = '음성 지시';
    this.micBtnEl.setAttribute('aria-label', '마이크 음성 입력 시작');
    this.micBtnEl.dataset.testid = 'mic-btn';
    this.micBtnEl.addEventListener('click', () =>
      this.callbacks.onToggleVoiceRecording(),
    );

    this.sendBtnEl = document.createElement('button');
    this.sendBtnEl.type = 'submit';
    this.sendBtnEl.className = 'sh-send-btn';
    this.sendBtnEl.textContent = '전송';
    this.sendBtnEl.dataset.testid = 'send-btn';

    form.append(this.chatInputEl, this.micBtnEl, this.sendBtnEl);

    const interactRow = document.createElement('div');
    interactRow.className = 'sh-action-strip';
    for (const item of PLAYGROUND_QUICK_COMMANDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sh-pill-btn';
      btn.textContent = item.label;
      btn.dataset.testid = `cmd-${item.command}`;
      btn.addEventListener('click', () =>
        this.callbacks.onTriggerPlaygroundCommand(item.command, item.prompt),
      );
      interactRow.appendChild(btn);
    }

    panel.append(this.choicesRowEl, form, interactRow);
    this.tabPanels.chat = panel;
    this.dockBodyEl.appendChild(panel);
  }

  private buildMotionTab(): void {
    const panel = document.createElement('div');
    panel.className = 'sh-tab-panel';

    const motionGrid = document.createElement('div');
    motionGrid.className = 'sh-action-strip';
    (Object.keys(SOMA_STYLE_LABELS) as SomaMotionStyle[]).forEach((style) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sh-pill-btn';
      btn.textContent = SOMA_STYLE_LABELS[style];
      btn.dataset.testid = `soma-style-${style}`;
      btn.addEventListener('click', () => this.callbacks.onSelectSomaStyle(style));
      this.somaStyleButtons.set(style, btn);
      motionGrid.appendChild(btn);
    });

    const loadersRow = document.createElement('div');
    loadersRow.className = 'sh-loaders-row';

    // VRM upload
    const vrmBox = document.createElement('div');
    vrmBox.className = 'sh-loader-card';
    const vrmInput = document.createElement('input');
    vrmInput.type = 'file';
    vrmInput.accept = '.vrm';
    vrmInput.id = 'vrm-file-input';
    vrmInput.className = 'sh-sr-input';
    vrmInput.addEventListener('change', () => {
      const f = vrmInput.files?.[0];
      if (f) this.callbacks.onLoadVrmFile(f);
      vrmInput.value = '';
    });
    const vrmLabel = document.createElement('label');
    vrmLabel.htmlFor = 'vrm-file-input';
    vrmLabel.className = 'sh-upload-btn';
    vrmLabel.textContent = '다른 VRM (.vrm) 로드';
    const vrmReset = document.createElement('button');
    vrmReset.type = 'button';
    vrmReset.className = 'sh-mini-btn';
    vrmReset.textContent = '기본 mech_girl.vrm';
    vrmReset.addEventListener('click', () => this.callbacks.onResetVrm());
    this.vrmStatusEl = document.createElement('span');
    this.vrmStatusEl.className = 'sh-loader-status';
    this.vrmStatusEl.dataset.testid = 'vrm-status';
    this.vrmStatusEl.textContent = 'mech_girl.vrm 로드 중…';
    vrmBox.append(vrmInput, vrmLabel, vrmReset, this.vrmStatusEl);

    // SOMA ONNX cloud + file upload
    const onnxBox = document.createElement('div');
    onnxBox.className = 'sh-loader-card';
    this.cloudOnnxBtnEl = document.createElement('button');
    this.cloudOnnxBtnEl.type = 'button';
    this.cloudOnnxBtnEl.className = 'sh-upload-btn';
    this.cloudOnnxBtnEl.textContent = 'WebGPU ONNX (243MB) 활성화';
    this.cloudOnnxBtnEl.dataset.testid = 'load-cloud-onnx-btn';
    this.cloudOnnxBtnEl.addEventListener('click', () =>
      this.callbacks.onLoadCloudOnnx(),
    );

    const onnxInput = document.createElement('input');
    onnxInput.type = 'file';
    onnxInput.accept = '.onnx';
    onnxInput.id = 'soma-onnx-input';
    onnxInput.className = 'sh-sr-input';
    onnxInput.addEventListener('change', () => {
      const f = onnxInput.files?.[0];
      if (f) this.callbacks.onLoadOnnxFile(f);
      onnxInput.value = '';
    });
    const onnxLabel = document.createElement('label');
    onnxLabel.htmlFor = 'soma-onnx-input';
    onnxLabel.className = 'sh-mini-btn';
    onnxLabel.textContent = '로컬 .onnx';

    const onnxReset = document.createElement('button');
    onnxReset.type = 'button';
    onnxReset.className = 'sh-mini-btn';
    onnxReset.textContent = 'SOMA-77 기본';
    onnxReset.addEventListener('click', () => this.callbacks.onResetOnnx());

    this.onnxStatusEl = document.createElement('span');
    this.onnxStatusEl.className = 'sh-loader-status';
    this.onnxStatusEl.dataset.testid = 'onnx-status';
    this.onnxStatusEl.textContent = 'MotionBricks SOMA-77 Runtime 준비 중…';

    onnxBox.append(
      this.cloudOnnxBtnEl,
      onnxInput,
      onnxLabel,
      onnxReset,
      this.onnxStatusEl,
    );

    loadersRow.append(vrmBox, onnxBox);
    panel.append(motionGrid, loadersRow);
    this.tabPanels.motion = panel;
    this.dockBodyEl.appendChild(panel);
  }

  private buildGazePersonaTab(): void {
    const panel = document.createElement('div');
    panel.className = 'sh-tab-panel';

    const personaRow = document.createElement('div');
    personaRow.className = 'sh-persona-row';
    for (const p of PERSONAS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sh-persona-btn';
      btn.dataset.testid = `persona-${p.id}`;
      btn.innerHTML = `<strong>${p.name}</strong><span>${p.role} (${p.voiceName})</span>`;
      btn.addEventListener('click', () => this.callbacks.onSelectPersona(p.id));
      this.personaButtons.set(p.id, btn);
      personaRow.appendChild(btn);
    }

    const gazeRow = document.createElement('div');
    gazeRow.className = 'sh-gaze-row';

    const gazeLabel = document.createElement('label');
    gazeLabel.className = 'sh-gaze-label';
    gazeLabel.textContent = '시선 반응 모드';
    this.gazeModeSelectEl = document.createElement('select');
    this.gazeModeSelectEl.className = 'sh-select';
    this.gazeModeSelectEl.setAttribute('aria-label', '시선 반응 모드 선택');
    this.gazeModeSelectEl.innerHTML = `
      <option value="lock_eyes">다정한 눈 맞춤 (Lock Eyes)</option>
      <option value="shy_avert">수줍은 시선 회피 (Shy Avert)</option>
      <option value="curious_tilt">호기심 고개 갸웃 (Curious)</option>
    `;
    this.gazeModeSelectEl.addEventListener('change', () => {
      this.callbacks.onChangeGazeMode(this.gazeModeSelectEl.value as GazeMode);
    });
    gazeLabel.appendChild(this.gazeModeSelectEl);

    this.webcamGazeBtnEl = document.createElement('button');
    this.webcamGazeBtnEl.type = 'button';
    this.webcamGazeBtnEl.className = 'sh-pill-btn';
    this.webcamGazeBtnEl.textContent = '웹캠 얼굴 시선 추적 OFF';
    this.webcamGazeBtnEl.dataset.testid = 'webcam-gaze-btn';
    this.webcamGazeBtnEl.addEventListener('click', () =>
      this.callbacks.onToggleWebcamGaze(),
    );

    const resetPgBtn = document.createElement('button');
    resetPgBtn.type = 'button';
    resetPgBtn.className = 'sh-pill-btn';
    resetPgBtn.textContent = '놀이터 위치 리셋';
    resetPgBtn.addEventListener('click', () => this.callbacks.onResetPlayground());

    gazeRow.append(gazeLabel, this.webcamGazeBtnEl, resetPgBtn);
    panel.append(personaRow, gazeRow);
    this.tabPanels.gaze = panel;
    this.dockBodyEl.appendChild(panel);
  }

  private createUtilButton(
    label: string,
    testId: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sh-util-btn';
    btn.textContent = label;
    btn.dataset.testid = testId;
    btn.addEventListener('click', (e) => {
      e.currentTarget && (e.currentTarget as HTMLButtonElement).blur();
      onClick();
    });
    return btn;
  }

  private switchTab(tab: 'chat' | 'motion' | 'gaze'): void {
    this.activeTab = tab;
    (['chat', 'motion', 'gaze'] as const).forEach((id) => {
      const active = id === tab;
      this.tabButtons[id].setAttribute('aria-selected', active ? 'true' : 'false');
      this.tabButtons[id].classList.toggle('is-active', active);
      this.tabPanels[id].hidden = !active;
    });
  }

  public toggleDockCollapse(): void {
    this.dockCollapsed = !this.dockCollapsed;
    this.dockEl.classList.toggle('is-collapsed', this.dockCollapsed);
    this.dockBodyEl.hidden = this.dockCollapsed;
    this.collapseBtnEl.textContent = this.dockCollapsed
      ? '도크 펼치기 [H]'
      : '도크 접기 [H]';
  }

  private bindGlobalKeys(): void {
    window.addEventListener('keydown', (e) => {
      const state = document.body.dataset.state;
      const targetTag = (e.target as HTMLElement | null)?.tagName;
      const isTyping =
        targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT';

      if (state === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.callbacks.onStartGame();
        }
        return;
      }

      if (e.key === 'Escape' || (!isTyping && e.key.toLowerCase() === 'p')) {
        e.preventDefault();
        this.callbacks.onPauseToggle();
      } else if (!isTyping && e.key.toLowerCase() === 'h' && state === 'playing') {
        e.preventDefault();
        this.toggleDockCollapse();
      }
    });
  }

  public setAppState(state: 'title' | 'playing' | 'paused'): void {
    document.body.dataset.state = state;
    this.titleOverlay.hidden = state !== 'title';
    this.playingHud.hidden = state === 'title';
    this.pauseModal.hidden = state !== 'paused';
  }

  public setBusy(busy: boolean): void {
    this.sendBtnEl.disabled = busy;
    this.sendBtnEl.textContent = busy ? '생각 중…' : '전송';
  }

  public setRecordingState(recording: boolean, interimText?: string): void {
    this.micBtnEl.classList.toggle('is-recording', recording);
    this.micBtnEl.textContent = recording ? '녹음 중지' : '음성 지시';
    if (interimText) {
      this.chatInputEl.value = interimText;
    }
  }

  public setToggles(params: {
    ttsEnabled: boolean;
    gazeEnabled: boolean;
    webcamGazeActive: boolean;
    spatialCardVisible: boolean;
    gazeMode: GazeMode;
    obstacleClickMode: 'sit' | 'vault';
  }): void {
    this.clickModeBtnEl.textContent =
      params.obstacleClickMode === 'sit'
        ? '벤치/시소 클릭: 앉기'
        : '벤치/시소 클릭: 타넘기';
    this.clickModeBtnEl.classList.toggle(
      'is-active',
      params.obstacleClickMode === 'vault',
    );
    this.ttsBtnEl.textContent = params.ttsEnabled ? 'TTS ON' : 'TTS OFF';
    this.ttsBtnEl.classList.toggle('is-active', params.ttsEnabled);
    this.gazeBtnEl.textContent = params.gazeEnabled ? '시선 ON' : '시선 OFF';
    this.gazeBtnEl.classList.toggle('is-active', params.gazeEnabled);
    this.webcamGazeBtnEl.textContent = params.webcamGazeActive
      ? '웹캠 얼굴 시선 추적 ON'
      : '웹캠 얼굴 시선 추적 OFF';
    this.webcamGazeBtnEl.classList.toggle('is-active', params.webcamGazeActive);
    this.spatialCardBtnEl.classList.toggle('is-active', params.spatialCardVisible);
    this.gazeModeSelectEl.value = params.gazeMode;
  }

  public setError(message: string | null): void {
    if (!message) {
      this.errorBannerEl.hidden = true;
      this.errorBannerEl.textContent = '';
    } else {
      this.errorBannerEl.hidden = false;
      this.errorBannerEl.textContent = message;
    }
  }

  public updateActivityBadge(statusLabelKo: string, somaClip: string): void {
    this.activityBadgeEl.textContent = statusLabelKo;
    this.somaBadgeEl.textContent = `SOMA: ${somaClip}`;
  }

  public syncState(params: {
    persona: PersonaProfile;
    relationship: RelationshipState;
    userEmotion: UserEmotionAnalysis;
    somaStatus: SomaRuntimeStatus;
    avatarStatus: AvatarRuntimeStatus;
    activityLabelKo: string;
    reply: string;
    choices: string[];
  }): void {
    this.personaBadgeEl.textContent = params.persona.name;
    this.stageBadgeEl.textContent = params.relationship.stage;
    this.affectionValEl.textContent = String(Math.round(params.relationship.affection));
    this.affectionBarEl.style.width = `${params.relationship.affection}%`;
    this.trustValEl.textContent = String(Math.round(params.relationship.trust));
    this.trustBarEl.style.width = `${params.relationship.trust}%`;
    this.moodValEl.textContent = String(Math.round(params.relationship.mood));
    this.moodBarEl.style.width = `${params.relationship.mood}%`;

    this.emotionBadgeEl.textContent = `감정: ${params.userEmotion.labelKo} (${Math.round(params.userEmotion.intensity * 100)}%)`;
    this.somaBadgeEl.textContent = `SOMA: ${params.somaStatus.activeClip}`;
    this.activityBadgeEl.textContent = params.activityLabelKo;

    this.replySpeakerEl.textContent = params.persona.name;
    this.replyTextEl.textContent = params.reply;
    this.innerThoughtEl.textContent = params.relationship.innerThought
      ? `속마음: “${params.relationship.innerThought}”`
      : '';

    // Quick choices
    this.choicesRowEl.innerHTML = '';
    for (const choice of params.choices) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sh-choice-btn';
      btn.textContent = choice;
      btn.addEventListener('click', () => this.callbacks.onSendMessage(choice));
      this.choicesRowEl.appendChild(btn);
    }

    // Active SOMA style highlight
    this.somaStyleButtons.forEach((btn, style) => {
      btn.classList.toggle('is-active', style === params.somaStatus.activeStyle);
    });

    // Active Persona highlight
    this.personaButtons.forEach((btn, id) => {
      btn.classList.toggle('is-active', id === params.persona.id);
    });

    // Runtime statuses
    this.vrmStatusEl.textContent =
      params.avatarStatus.kind === 'external-vrm'
        ? `VRM 로드됨: ${params.avatarStatus.name}`
        : `Fallback Rig (${params.persona.name})`;

    if (params.somaStatus.liveOnnxLoading) {
      this.cloudOnnxBtnEl.disabled = true;
      this.onnxStatusEl.textContent =
        params.somaStatus.liveOnnxProgress || 'ONNX 다운로드 중…';
    } else {
      this.cloudOnnxBtnEl.disabled = false;
      this.cloudOnnxBtnEl.textContent = params.somaStatus.liveOnnxReady
        ? 'WebGPU ONNX 활성화됨'
        : 'WebGPU ONNX (243MB) 활성화';
      this.onnxStatusEl.textContent = `${params.somaStatus.modelName} (${params.somaStatus.jointCount} joints)`;
    }
  }
}

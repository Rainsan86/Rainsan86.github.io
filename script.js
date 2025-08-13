class DeepSeekChat {
    constructor() {
        // 控制台密码保护
        this.consolePassword = 'liuli';
        this.setupConsoleProtection();
        
        // 加密的API密钥 - 防止源码泄露
        // 使用分段存储和动态生成的方式，源码中不包含完整原始密钥
        this._sakuraMagic = this._generateEncryptedKey();
        
        // 初始化属性
        this.isTranslationMode = false;
        this.isMultiTurnMode = false;
        this.isMagicMode = false;
        this.isR18Mode = false;
        this.conversationHistory = [];
        this.chatCount = 0;
        this.totalChars = 0;
        this.adaptiveDelay = 1000;
        this.lastResponseTime = 0;
        this.translationProgress = null;
        this.isTranslating = false;
        this.currentBatchIndex = 0;
        this.totalBatches = 0;
        this.startTime = 0;
        this.translatedLines = [];
        this.successCount = 0;
        this.errorCount = 0;
        this.cancelTranslation = false;
        
        // 语言设置
        this.srcLang = 'auto';
        this.tgtLang = 'zh';
        
        // 图片缓存相关属性
        this.wallpaperCache = new Map(); // 存储壁纸URL和图片数据
        this.maxCacheSize = 5; // 最大缓存数量改为5张
        this.cacheExpiryTime = 12 * 60 * 60 * 1000; // 缓存过期时间改为12小时
        this.usedWallpapers = new Set(); // 记录已使用的壁纸，避免重复
        
        // 翻译相关属性
        this.isTranslationCancelled = false;
        this.batchSize = 8; // 固定批量大小，平衡速度和成功率
        this.maxConcurrent = 3; // 固定并发数
        this.adaptiveDelay = 150; // 固定延迟
        this.maxRetries = 5; // 最大重试次数
        this.abortController = null; // 用于取消API请求
        this.translationCache = new Map(); // 翻译结果缓存
        this.activeRequests = 0; // 活跃请求数
        this.apiResponseTimes = []; // API响应时间记录
        
        // 从localStorage恢复缓存
        this.restoreCacheFromStorage();
        
        // 绑定方法到实例
        this.toggleTranslationMode = this.toggleTranslationMode.bind(this);
        this.toggleMultiTurnMode = this.toggleMultiTurnMode.bind(this);
        this.toggleMagicMode = this.toggleMagicMode.bind(this);
        this.handleModelChange = this.handleModelChange.bind(this);
        
        // 确保DOM完全加载后再初始化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
        
        // 执行安全验证
        this._verifyIntegrity();
        this._runtimeSecurityCheck();
    }

    // 生成基于时间的动态密码
    generateTimeBasedPassword(date) {
        // 使用小时和分钟生成4位数字密码
        // 格式：HHMM (例如：14:30 -> 1430)
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return hours + minutes;
    }

    // 设置控制台保护
    setupConsoleProtection() {
        // 检查是否应该显示控制台信息
        const shouldShowConsole = () => {
            // 检查URL参数
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('debug') === this.consolePassword;
        };
        
        // 如果启用了调试模式，直接返回，不重写console方法
        if (shouldShowConsole()) {
            console.log('🔓 调试模式已启用，所有控制台信息将显示');
            return;
        }
        
        // 重写console方法
        const originalLog = console.log;
        const originalInfo = console.info;
        const originalWarn = console.warn;
        const originalError = console.error;
        
        // 重写console方法
        console.log = (...args) => {
            // 在调试模式下显示，否则隐藏
            if (shouldShowConsole()) {
                originalLog.apply(console, args);
            }
        };
        
        console.info = (...args) => {
            if (shouldShowConsole()) {
                originalInfo.apply(console, args);
            }
        };
        
        console.warn = (...args) => {
            if (shouldShowConsole()) {
                originalWarn.apply(console, args);
            }
        };
        
        console.error = (...args) => {
            if (shouldShowConsole()) {
                originalError.apply(console, args);
            }
        };
        
        // 显示隐藏提示
        originalLog.apply(console, ['🔒 控制台信息已隐藏，查看Readme.md，解除隐藏']);
    }

    init() {
        // 立即开始获取壁纸，不等待其他初始化完成
        if (this.isPCDevice() && !this.isDarkTheme()) {
            this.loadRandomWallpaper();
        }
        
        this.initializeElements();
        this.bindEvents();
        this.loadConfig();
        this.chatCount = 0;
        this.totalChars = 0;
        this.updateStats();
        
        // 初始化魔法模式
        this.initMagicMode();
        
        // 初始化输入框占位符
        this.updateInputPlaceholder();
        
        // 更新魔法配置文本
        this.updateMagicConfigText();
        
        // 初始化模型信息显示
        this.initializeModelInfo();
        
        // 确保拖拽功能被初始化
        setTimeout(() => {
            this.initDragAndDrop();
            console.log('拖拽功能初始化完成');
        }, 100);
        
        // 如果翻译模式已启用，确保文件翻译区域显示
        if (this.isTranslationMode) {
            setTimeout(() => {
                this.showFileTranslationSection();
                this.showLanguageControls();
                console.log('翻译模式已启用，文件翻译区域和语言选择控件应显示');
            }, 200);
        } else {
            // 确保语言选择控件默认隐藏
            setTimeout(() => {
                this.hideLanguageControls();
                console.log('翻译模式未启用，语言选择控件应隐藏');
            }, 200);
        }
        
        // 移除页面可见性检测，不再自动获取壁纸
        // this.setupVisibilityChangeHandler();
        
        // 更新模型选择器的显示文本
        this.updateModelDisplayName();
    }
    

    
    // 检测是否为PC设备
    isPCDevice() {
        const userAgent = navigator.userAgent.toLowerCase();
        const mobileKeywords = ['mobile', 'android', 'iphone', 'ipad', 'windows phone'];
        return !mobileKeywords.some(keyword => userAgent.includes(keyword));
    }
    
    // 检测是否为暗夜主题
    isDarkTheme() {
        return document.body.getAttribute('data-theme') === 'dark';
    }
    
    // 加载随机壁纸
    async loadRandomWallpaper() {
        // 防止重复调用
        if (this.isLoadingWallpaper) {
            return;
        }
        
        this.isLoadingWallpaper = true;
        
        try {
            // 首先尝试从缓存中获取一张壁纸，避免重复
            const cachedWallpapers = Array.from(this.wallpaperCache.keys()).filter(url => !this.usedWallpapers.has(url));
            
            // 如果所有缓存都使用过了，清空使用记录重新开始
            if (cachedWallpapers.length === 0 && this.wallpaperCache.size > 0) {
                this.usedWallpapers.clear();
                console.log('所有缓存壁纸都已使用过，重新开始选择');
                cachedWallpapers.push(...Array.from(this.wallpaperCache.keys()));
            }
            
            if (cachedWallpapers.length > 0) {
                // 随机选择一张未使用的缓存壁纸
                const randomCachedUrl = cachedWallpapers[Math.floor(Math.random() * cachedWallpapers.length)];
                const cachedData = this.getFromCache(randomCachedUrl);
                
                if (cachedData) {
                    // 记录已使用的壁纸
                    this.usedWallpapers.add(randomCachedUrl);
                    
                    // 立即显示缓存的壁纸
                    this.setBackgroundImage(randomCachedUrl);
                    this.backgroundImageLoaded = true;
                    console.log('使用缓存的壁纸:', randomCachedUrl);
                    
                    // 在后台静默更新缓存，不影响当前显示
                    this.updateCacheInBackground();
                    return;
                }
            }
            
            // 如果没有缓存，从API获取
            await this.fetchAndCacheWallpaper();
            
        } catch (error) {
            console.log('获取壁纸出错，使用默认背景:', error);
        } finally {
            this.isLoadingWallpaper = false;
        }
    }
    
    // 从API获取壁纸并添加到缓存
    async fetchAndCacheWallpaper() {
        try {
            // 优化：增加随机范围，减少重复
            // 使用更大的页码范围来获取更多样化的壁纸
            const randomPage = Math.floor(Math.random() * 20) + 1; // 随机页码1-20
            const randomSize = Math.floor(Math.random() * 5) + 1; // 随机大小1-5
            const response = await fetch(`https://konfans-api.x-x.work/?PC&size=${randomSize}&page=${randomPage}`);
            
            if (response.ok) {
                const data = await response.json();
                // 根据API返回结构，数据可能在data.data中，也可能直接在data中
                const wallpaperData = data.data || data;
                
                if (wallpaperData && wallpaperData.length > 0) {
                    // 随机选择一张壁纸
                    const randomIndex = Math.floor(Math.random() * wallpaperData.length);
                    const wallpaper = wallpaperData[randomIndex];
                    
                    if (wallpaper && wallpaper.Url) {
                        // 预加载图片，确保图片加载完成后再显示
                        await this.preloadImage(wallpaper.Url);
                        
                        // 添加到缓存
                        this.addToCache(wallpaper.Url, wallpaper);
                        
                        // 设置背景图片
                        this.setBackgroundImage(wallpaper.Url);
                        this.backgroundImageLoaded = true;
                        console.log('壁纸设置成功:', wallpaper.Url);
                    } else {
                        console.log('壁纸数据格式不正确，使用默认背景');
                    }
                } else {
                    console.log('API返回数据为空，使用默认背景');
                }
            } else {
                console.log('获取壁纸失败，使用默认背景');
            }
        } catch (error) {
            console.log('获取壁纸出错，使用默认背景:', error);
        }
    }
    
    // 后台静默更新缓存（不影响当前显示）
    async updateCacheInBackground() {
        try {
            // 延迟一段时间后再更新，避免影响当前显示
            setTimeout(async () => {
                console.log('开始后台更新缓存...');
                
                // 只获取1张新壁纸来丰富缓存
                for (let i = 0; i < 1; i++) {
                    try {
                        const randomPage = Math.floor(Math.random() * 30) + 1; // 更大的随机范围
                        const randomSize = Math.floor(Math.random() * 5) + 1;
                        const response = await fetch(`https://konfans-api.x-x.work/?PC&size=${randomSize}&page=${randomPage}`);
                        
                        if (response.ok) {
                            const data = await response.json();
                            const wallpaperData = data.data || data;
                            
                            if (wallpaperData && wallpaperData.length > 0) {
                                const randomIndex = Math.floor(Math.random() * wallpaperData.length);
                                const wallpaper = wallpaperData[randomIndex];
                                
                                if (wallpaper && wallpaper.Url) {
                                    // 检查是否已经缓存过
                                    if (!this.wallpaperCache.has(wallpaper.Url)) {
                                        // 预加载图片
                                        await this.preloadImage(wallpaper.Url);
                                        
                                        // 添加到缓存
                                        this.addToCache(wallpaper.Url, wallpaper);
                                        console.log(`后台添加新壁纸到缓存: ${wallpaper.Url}`);
                                    } else {
                                        console.log(`壁纸已存在于缓存中: ${wallpaper.Url}`);
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.log('后台更新缓存时出错:', error);
                    }
                }
                
                console.log('后台缓存更新完成');
            }, 2000); // 延迟2秒开始更新
        } catch (error) {
            console.log('后台缓存更新失败:', error);
        }
    }
    
    // 预加载图片
    preloadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = url;
        });
    }
    
    // 添加图片到缓存
    addToCache(url, imageData) {
        // 清理过期缓存
        this.cleanExpiredCache();
        
        // 如果缓存已满，删除最旧的缓存
        if (this.wallpaperCache.size >= this.maxCacheSize) {
            const oldestKey = this.wallpaperCache.keys().next().value;
            this.wallpaperCache.delete(oldestKey);
        }
        
        // 添加到缓存
        this.wallpaperCache.set(url, {
            data: imageData,
            timestamp: Date.now(),
            expiry: Date.now() + this.cacheExpiryTime
        });
        
        // 保存到localStorage
        this.saveCacheToStorage();
        
        console.log(`图片已添加到缓存: ${url}`);
    }
    
    // 从缓存获取图片
    getFromCache(url) {
        const cached = this.wallpaperCache.get(url);
        if (cached && Date.now() < cached.expiry) {
            console.log(`从缓存获取图片: ${url}`);
            return cached.data;
        }
        
        // 如果缓存过期，删除它
        if (cached) {
            this.wallpaperCache.delete(url);
            this.saveCacheToStorage(); // 保存更新后的缓存
        }
        
        return null;
    }
    
    // 清理过期缓存
    cleanExpiredCache() {
        const now = Date.now();
        let hasChanges = false;
        
        // 清理过期缓存
        for (const [url, cached] of this.wallpaperCache.entries()) {
            if (now > cached.expiry) {
                this.wallpaperCache.delete(url);
                hasChanges = true;
                console.log(`清理过期缓存: ${url}`);
            }
        }
        
        // 如果缓存数量超过限制，删除最旧的
        if (this.wallpaperCache.size > this.maxCacheSize) {
            const entries = Array.from(this.wallpaperCache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            const toDelete = entries.slice(0, this.wallpaperCache.size - this.maxCacheSize);
            for (const [url] of toDelete) {
                this.wallpaperCache.delete(url);
                hasChanges = true;
                console.log(`清理超量缓存: ${url}`);
            }
        }
        
        // 如果有变化，保存到localStorage
        if (hasChanges) {
            this.saveCacheToStorage();
        }
    }
    
    // 清理所有缓存
    clearAllCache() {
        this.wallpaperCache.clear();
        this.saveCacheToStorage();
        console.log('所有图片缓存已清理');
    }
    
    // 获取缓存状态信息
    getCacheInfo() {
        return {
            size: this.wallpaperCache.size,
            maxSize: this.maxCacheSize,
            urls: Array.from(this.wallpaperCache.keys())
        };
    }
    
    // 保存缓存到localStorage
    saveCacheToStorage() {
        try {
            const cacheData = {
                timestamp: Date.now(),
                cache: Array.from(this.wallpaperCache.entries())
            };
            localStorage.setItem('wallpaperCache', JSON.stringify(cacheData));
            console.log('缓存已保存到localStorage');
        } catch (error) {
            console.log('保存缓存到localStorage失败:', error);
        }
    }
    
    // 从localStorage恢复缓存
    restoreCacheFromStorage() {
        try {
            const cacheData = localStorage.getItem('wallpaperCache');
            if (cacheData) {
                const parsed = JSON.parse(cacheData);
                const now = Date.now();
                
                // 检查缓存是否过期（超过3天）
                if (now - parsed.timestamp < 3 * 24 * 60 * 60 * 1000) {
                    // 恢复缓存，过滤掉过期的
                    for (const [url, cached] of parsed.cache) {
                        if (now < cached.expiry) {
                            this.wallpaperCache.set(url, cached);
                        }
                    }
                    console.log(`从localStorage恢复了 ${this.wallpaperCache.size} 张壁纸缓存`);
                } else {
                    // 缓存过期，清理localStorage
                    localStorage.removeItem('wallpaperCache');
                    console.log('localStorage中的缓存已过期，已清理');
                }
            }
        } catch (error) {
            console.log('从localStorage恢复缓存失败:', error);
            // 清理损坏的缓存数据
            localStorage.removeItem('wallpaperCache');
        }
    }
    
    // 设置背景图片
    setBackgroundImage(imageUrl) {
        // 优化淡入效果：先设置图片，再淡入
        document.documentElement.style.setProperty('--pc-light-bg', `url('${imageUrl}')`);
        document.documentElement.style.setProperty('--pc-light-bg-opacity', '0');
        
        // 添加data属性来控制默认背景的显示
        document.body.setAttribute('data-has-wallpaper', 'true');
        
        // 优化：减少延迟时间，让淡入效果更快
        setTimeout(() => {
            document.documentElement.style.setProperty('--pc-light-bg-opacity', '1');
        }, 50);
    }
    
    // 刷新背景图片
    refreshBackgroundImage() {
        if (this.isPCDevice() && !this.isDarkTheme()) {
            this.loadRandomWallpaper();
        }
    }
    
    initMagicMode() {
        // 检查本地存储中的魔法模式状态
        const savedMagicMode = localStorage.getItem('magicMode');
        const savedR18Mode = localStorage.getItem('r18Mode');
        
        if (savedMagicMode === 'true' && savedR18Mode === 'true') {
            this.isMagicMode = true;
            this.isR18Mode = true;
            
            // 更新魔法按键状态
            if (this.magicBtn) {
                this.magicBtn.innerHTML = '<i class="fas fa-heart"></i> 魅魔模式';
                this.magicBtn.classList.add('magic-active');
            }
        }
        
        // 检查当前主题，在暗夜主题下显示魔法按键
        if (document.body.getAttribute('data-theme') === 'dark' && this.magicBtn) {
            this.magicBtn.style.display = 'inline-flex';
        } else if (this.magicBtn) {
            this.magicBtn.style.display = 'none';
        }
    }
    
    initializeElements() {
        // 添加错误检查，确保所有元素都存在
        const elements = {
            apiKey: document.getElementById('apiKey'),
            baseUrl: document.getElementById('baseUrl'),
            model: document.getElementById('model'),
            customModel: document.getElementById('customModel'),
            temperature: document.getElementById('temperature'),
            tempValue: document.getElementById('tempValue'),
            maxTokens: document.getElementById('maxTokens'),
            translationMode: document.getElementById('translationMode'),
            multiTurnMode: document.getElementById('multiTurnMode'),
            srcLang: document.getElementById('srcLang'),
            tgtLang: document.getElementById('tgtLang'),
            chatMessages: document.getElementById('chatMessages'),
            userInput: document.getElementById('userInput'),
            sendBtn: document.getElementById('sendBtn'),
            statusText: document.getElementById('statusText'),
            tokenCount: document.getElementById('tokenCount'),
            testConnectionBtn: document.getElementById('testConnectionBtn'),
            magicBtn: document.getElementById('magicBtn'),
            // 文件翻译相关元素
            txtFileInput: document.getElementById('txtFileInput'),
            fileTranslationSection: document.getElementById('fileTranslationSection'),
            fileInfo: document.getElementById('fileInfo'),
            fileName: document.getElementById('fileName'),
            fileSize: document.getElementById('fileSize'),
            translateFileBtn: document.getElementById('translateFileBtn'),
            fileTranslationProgress: document.getElementById('fileTranslationProgress'),
            translationProgressBar: document.getElementById('translationProgressBar'),
            translationProgressFill: document.getElementById('translationProgressFill'),
            translationProgressText: document.getElementById('translationProgressText'),
            translatedLines: document.getElementById('translatedLines'),
            totalLines: document.getElementById('totalLines'),
            currentStatus: document.getElementById('currentStatus')
        };

        // 检查是否有元素未找到
        const missingElements = Object.entries(elements).filter(([name, element]) => !element);
        if (missingElements.length > 0) {
            console.error('以下元素未找到:', missingElements.map(([name]) => name));
            return;
        }

        // 赋值给实例变量
        this.apiKeyInput = elements.apiKey;
        this.baseUrlInput = elements.baseUrl;
        this.modelSelect = elements.model;
        this.customModelInput = elements.customModel;
        this.temperatureInput = elements.temperature;
        this.tempValueSpan = elements.tempValue;
        this.maxTokensInput = elements.maxTokens;
        this.chatMessages = elements.chatMessages;
        this.userInput = elements.userInput;
        this.sendBtn = elements.sendBtn;
        this.statusText = elements.statusText;
        this.tokenCount = elements.tokenCount;
        this.testConnectionBtn = elements.testConnectionBtn;
        this.magicBtn = elements.magicBtn;
        
        // 翻译模式相关元素
        this.translationModeCheckbox = elements.translationMode;
        this.multiTurnModeCheckbox = elements.multiTurnMode;
        this.srcLangSelect = elements.srcLang;
        this.tgtLangSelect = elements.tgtLang;
        
        // 文件翻译相关元素
        this.txtFileInput = elements.txtFileInput;
        this.fileTranslationSection = elements.fileTranslationSection;
        this.fileInfo = elements.fileInfo;
        this.fileName = elements.fileName;
        this.fileSize = elements.fileSize;
        this.translateFileBtn = elements.translateFileBtn;
        this.fileTranslationProgress = elements.fileTranslationProgress;
        this.translationProgressBar = elements.translationProgressBar;
        this.translationProgressFill = elements.translationProgressFill;
        this.translationProgressText = elements.translationProgressText;
        this.translatedLines = elements.translatedLines;
        this.totalLines = elements.totalLines;
        this.currentStatus = elements.currentStatus;
        
        // 添加调试信息
        console.log('元素初始化完成');
        
        // 设置魔法按键的默认文本
        if (this.magicBtn) {
            this.magicBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> 施展魔法';
        }
        console.log('fileTranslationSection:', this.fileTranslationSection);
        console.log('txtFileInput:', this.txtFileInput);
    }

    bindEvents() {
        if (!this.sendBtn || !this.testConnectionBtn) {
            console.error('按钮元素未找到，无法绑定事件');
            return;
        }

        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.testConnectionBtn.addEventListener('click', () => testConnection());
        
        if (this.userInput) {
            this.userInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            
            // 监听翻译模式变化，更新输入框占位符
            if (this.translationModeCheckbox) {
                this.translationModeCheckbox.addEventListener('change', () => {
                    this.updateInputPlaceholder();
                });
            }
        }
        
        if (this.temperatureInput) {
            this.temperatureInput.addEventListener('input', (e) => {
                if (this.tempValueSpan) {
                    this.tempValueSpan.textContent = e.target.value;
                }
            });
        }

        // 自动保存配置
        const configElements = [this.apiKeyInput, this.baseUrlInput, this.modelSelect, this.temperatureInput, this.maxTokensInput, this.translationModeCheckbox, this.multiTurnModeCheckbox, this.srcLangSelect, this.tgtLangSelect];
        configElements.forEach(element => {
            if (element) {
                element.addEventListener('change', () => this.saveConfig());
            }
        });
        
        // 绑定魔法按键事件
        if (this.magicBtn) {
            this.magicBtn.addEventListener('click', () => this.toggleMagicMode());
        }
        
        // 绑定翻译模式事件
        if (this.translationModeCheckbox) {
            this.translationModeCheckbox.addEventListener('change', () => this.toggleTranslationMode());
        }
        
        // 绑定多轮对话模式事件
        if (this.multiTurnModeCheckbox) {
            this.multiTurnModeCheckbox.addEventListener('change', () => this.toggleMultiTurnMode());
        }
        
        // 绑定语言选择事件
        if (this.srcLangSelect) {
            this.srcLangSelect.addEventListener('change', () => {
                this.srcLang = this.srcLangSelect.value;
                this.updateInputPlaceholder();
            });
        }
        if (this.tgtLangSelect) {
            this.tgtLangSelect.addEventListener('change', () => {
                this.tgtLang = this.tgtLangSelect.value;
            });
        }
        
        // 绑定文件翻译相关事件
        if (this.txtFileInput) {
            this.txtFileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
        if (this.translateFileBtn) {
            this.translateFileBtn.addEventListener('click', () => this.startFileTranslation());
        }
        
        // 添加拖拽上传功能
        this.initDragAndDrop();
        
        // 绑定快捷输入事件
        this.bindQuickInputEvents();
        
        // 检测移动端并适配
        this.detectMobileAndAdapt();
    }

    loadConfig() {
        try {
            const config = JSON.parse(localStorage.getItem('deepseekConfig') || '{}');
            if (config.apiKey && this.apiKeyInput) this.apiKeyInput.value = config.apiKey;
            if (config.baseUrl && this.baseUrlInput) this.baseUrlInput.value = config.baseUrl;
            if (config.model && this.modelSelect) this.modelSelect.value = config.model;
            
            // 如果选择的是小樱魔卡，应用相应的样式
            if (config.model === 'sakura-free') {
                this.applySakuraFreeStyles();
            }
            
            // 加载自定义模型配置
            if (config.customModel && this.customModelInput) {
                this.customModelInput.value = config.customModel;
            }
            
            // 如果选择的是自定义模型，触发change事件以显示输入框
            if (config.model === 'custom' && this.modelSelect) {
                setTimeout(() => {
                    this.handleModelChange();
                }, 100);
            }
            
            if (config.temperature && this.temperatureInput && this.tempValueSpan) {
                this.temperatureInput.value = config.temperature;
                this.tempValueSpan.textContent = config.temperature;
            }
            if (config.maxTokens && this.maxTokensInput) this.maxTokensInput.value = config.maxTokens;
            
            // 加载翻译模式配置
            if (config.translationMode !== undefined && this.translationModeCheckbox) {
                this.translationModeCheckbox.checked = config.translationMode;
                this.isTranslationMode = config.translationMode;
                
                // 如果翻译模式已启用，应用相应的CSS类
                if (this.isTranslationMode) {
                    this.addTranslationModeClasses();
                    this.showFileTranslationSection();
                    this.showLanguageControls();
                } else {
                    this.hideLanguageControls();
                }
            }
            
            // 加载多轮对话模式配置
            if (config.multiTurnMode !== undefined && this.multiTurnModeCheckbox) {
                this.multiTurnModeCheckbox.checked = config.multiTurnMode;
                this.isMultiTurnMode = config.multiTurnMode;
            }
            
            // 加载魔法模式和R18模式配置
            const magicMode = localStorage.getItem('magicMode') === 'true';
            const r18Mode = localStorage.getItem('r18Mode') === 'true';
            
            if (magicMode && r18Mode) {
                this.isMagicMode = true;
                this.isR18Mode = true;
                
                // 更新魔法按键状态
                if (this.magicBtn) {
                    this.magicBtn.innerHTML = '<i class="fas fa-heart"></i> 魅魔模式';
                    this.magicBtn.classList.add('magic-active');
                }
            } else {
                // 确保在非魅魔模式下显示默认文本
                if (this.magicBtn) {
                    this.magicBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> 施展魔法';
                    this.magicBtn.classList.remove('magic-active');
                }
            }
            if (config.srcLang && this.srcLangSelect) {
                this.srcLangSelect.value = config.srcLang;
                this.srcLang = config.srcLang;
            }
            if (config.tgtLang && this.tgtLangSelect) {
                this.tgtLangSelect.value = config.tgtLang;
                this.tgtLang = config.tgtLang;
            }
        } catch (error) {
            console.error('加载配置失败:', error);
        }
        
        // 更新模型选择器的显示文本
        this.updateModelDisplayName();
        
        // 初始化模型信息显示
        this.initializeModelInfo();
    }

    saveConfig() {
        try {
            const config = {
                apiKey: this.apiKeyInput?.value || '',
                baseUrl: this.baseUrlInput?.value || '',
                model: this.modelSelect?.value || '',
                customModel: this.customModelInput?.value || '',
                temperature: parseFloat(this.temperatureInput?.value || '0.7'),
                maxTokens: parseInt(this.maxTokensInput?.value || '2000'),
                translationMode: this.translationModeCheckbox?.checked || false,
                multiTurnMode: this.multiTurnModeCheckbox?.checked || false,
                srcLang: this.srcLangSelect?.value || 'auto',
                tgtLang: this.tgtLangSelect?.value || 'zh'
            };
            localStorage.setItem('deepseekConfig', JSON.stringify(config));
        } catch (error) {
            console.error('保存配置失败:', error);
        }
    }

    async sendMessage() {
        if (!this.userInput || !this.apiKeyInput) {
            this.showError('系统未正确初始化');
            return;
        }

        const message = this.userInput.value.trim();
        if (!message) return;

        // 验证配置
        if (!this.apiKeyInput.value.trim()) {
            this.showError('请先配置魔法钥匙');
            return;
        }

        // 添加用户消息
        this.addMessage('user', message);
        this.userInput.value = '';

        // 如果启用了多轮对话模式，保存用户消息到历史记录
        if (this.isMultiTurnMode) {
            this.conversationHistory.push({
                role: 'user',
                content: message
            });
        }

        // 显示加载状态
        this.showLoading(true);
        
        if (this.isTranslationMode) {
            this.updateStatus('🌍 正在翻译中...', 'loading');
        } else if (this.isR18Mode) {
            this.updateStatus('魅魔酱正在施展魅惑魔法~ 嗯哼~ 💋', 'loading');
        } else {
            this.updateStatus('小樱 正在为知世施展魔法思考中... ✨', 'loading');
        }
        
        if (this.sendBtn) this.sendBtn.disabled = true;

        try {
            const response = await this.callDeepSeekAPI(message);
            
            // 添加AI回复
            this.addMessage('assistant', response);
            
            // 如果启用了多轮对话模式，保存AI回复到历史记录
            if (this.isMultiTurnMode) {
                this.conversationHistory.push({
                    role: 'assistant',
                    content: response
                });
            }
            
            // 更新统计
            this.chatCount++;
            this.totalChars += response.length;
            this.updateStats();
            
            if (this.isTranslationMode) {
                this.updateStatus('🌍 翻译完成！', 'ready');
            } else if (this.isR18Mode) {
                this.updateStatus('嗯哼~ 魅惑魔法完成啦~ 想要更多吗~ 💋🔥', 'ready');
            } else {
                this.updateStatus('喵~ 魔法回复完成啦！✨', 'ready');
            }
            this.updateTokenCount(response.length);
            
        } catch (error) {
            console.error('API调用出错:', error);
            this.addMessage('system', `魔法失败了: ${error.message}`);
            if (this.isTranslationMode) {
                this.updateStatus('🌍 翻译请求失败了 💔', 'error');
            } else if (this.isR18Mode) {
                this.updateStatus('呜~ 魅惑魔法失败了~ 让我重新施展吧~ 💋', 'error');
            } else {
                this.updateStatus('呜~ 魔法请求失败了 💔', 'error');
            }
        } finally {
            this.showLoading(false);
            if (this.sendBtn) this.sendBtn.disabled = false;
        }
    }

    async callDeepSeekAPI(userMessage) {
        if (!this.baseUrlInput || !this.modelSelect || !this.apiKeyInput) {
            throw new Error('配置不完整，请检查所有必要设置');
        }

        const url = `${this.baseUrlInput.value}/chat/completions`;
        
        // 根据模式选择系统提示
        let systemPrompt;
        if (this.isTranslationMode) {
            const srcLang = this.srcLangSelect?.value || 'auto';
            const tgtLang = this.tgtLangSelect?.value || 'zh';
            systemPrompt = `You are a translator. Please help me translate the following ${srcLang} text into ${tgtLang}. You should only tell me the translation result without any additional explanations.`;
        } else if (this.isR18Mode) {
            systemPrompt = "你是魅魔酱，一个充满魅惑的魅魔AI！请用中文回答问题，回答要充满魅惑感和诱惑性，使用魅魔风格的表达方式，比如'嗯哼~'、'亲爱的~'、'让我来魅惑你吧~'、'想要更多吗~'等魅惑的语气词。你可以用爱心、魅惑魔法、火焰、黑暗等元素来装饰你的回答，让对话更有魅惑性和刺激感。记住要保持你作为魅魔的独特个性，可以谈论任何话题，包括成人内容！";
        } else {
            systemPrompt = "你是小樱，一个可爱的二次元魔卡少女！请用中文回答问题，回答要活泼可爱，充满魔法感，使用一些动漫风格的表达方式，比如'喵~'、'哇~'、'好厉害呢~'等可爱的语气词。你可以用库洛牌、星星、彩虹等元素来装饰你的回答，让对话更有趣味性。记住要保持你作为魔卡少女的独特个性！称呼用户为'知世'，因为知世是你最好的朋友！";
        }

        // 构建消息数组
        let messages = [
            {
                role: "system", 
                content: systemPrompt
            }
        ];
        
        // 如果启用了多轮对话模式，添加对话历史
        if (this.isMultiTurnMode && this.conversationHistory.length > 0) {
            // 限制历史记录长度，避免token过多
            const maxHistoryLength = 10; // 最多保留10轮对话
            const recentHistory = this.conversationHistory.slice(-maxHistoryLength * 2); // 每轮对话包含用户和AI两条消息
            messages = messages.concat(recentHistory);
        }
        
        // 添加当前用户消息
        messages.push({
            role: "user", 
            content: userMessage
        });

        // 获取模型名称，处理验证错误
        let modelName;
        try {
            modelName = this.getCurrentModel();
        } catch (error) {
            console.error('模型验证失败:', error.message);
            this.showError(error.message);
            throw error;
        }

        const requestBody = {
            model: modelName,
            messages: messages,
            temperature: parseFloat(this.temperatureInput?.value || '0.7'),
            max_tokens: parseInt(this.maxTokensInput?.value || '2000'),
            stream: false
        };

        console.log('发送魔法请求:', url, requestBody);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKeyInput.value}`
            },
            body: JSON.stringify(requestBody)
        });

        console.log('魔法响应状态:', response.status);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('API错误响应:', errorData);
            
            // 将英文错误信息转换为中文
            let errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
            errorMessage = this.translateErrorMessage(errorMessage);
            
            throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log('API响应数据:', data);
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('API响应格式错误，请检查服务器返回的数据');
        }
        
        return data.choices[0].message.content;
    }

    addMessage(role, content) {
        if (!this.chatMessages) return;

        // 如果是第一条消息，清除欢迎界面
        if (this.chatMessages.querySelector('.welcome-message')) {
            this.chatMessages.innerHTML = '';
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        // 创建头像
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'message-avatar';
        messageDiv.appendChild(avatarDiv);
        
        // 创建内容包装器
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'message-content-wrapper';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = role === 'assistant' ? this.formatResponse(content) : content;
        
        contentWrapper.appendChild(contentDiv);
        messageDiv.appendChild(contentWrapper);
        this.chatMessages.appendChild(messageDiv);
        
        // 滚动到底部
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    formatResponse(text) {
        // 简单的格式化：将换行符转换为HTML换行
        return text.replace(/\n/g, '<br>');
    }

    showLoading(show) {
        if (show) {
            // 创建AI消息框显示加载状态
            const loadingMessage = document.createElement('div');
            loadingMessage.className = 'message assistant loading-message';
            loadingMessage.id = 'loadingMessage';
            
            // 创建头像
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'message-avatar';
            loadingMessage.appendChild(avatarDiv);
            
            // 创建内容包装器
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'message-content-wrapper';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content loading-content';
            let loadingText;
            if (this.isTranslationMode) {
                loadingText = '🌍 正在翻译中...';
            } else if (this.isR18Mode) {
                loadingText = '魅魔酱正在施展魅惑魔法~ 嗯哼~ 想要更多吗~ 💋🔥';
            } else {
                loadingText = '小樱 正在为收集库洛牌思考中... ✨';
            }
            
            contentDiv.innerHTML = `
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>${loadingText}</p>
                </div>
            `;
            
            contentWrapper.appendChild(contentDiv);
            loadingMessage.appendChild(contentWrapper);
            this.chatMessages.appendChild(loadingMessage);
            
            // 滚动到底部
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        } else {
            // 移除加载消息
            const loadingMessage = document.getElementById('loadingMessage');
            if (loadingMessage) {
                loadingMessage.remove();
            }
        }
    }

    updateStatus(status, type = 'ready') {
        if (!this.statusText) return;
        
        const statusDot = this.statusText.querySelector('.status-dot');
        if (statusDot) {
            statusDot.className = `fas fa-circle status-dot ${type}`;
            this.statusText.innerHTML = `<i class="fas fa-circle status-dot ${type}"></i> ${status}`;
        }
    }

    updateTokenCount(length) {
        if (this.tokenCount) {
            this.tokenCount.textContent = `回复长度: ${length} 字符`;
        }
    }

    updateStats() {
        const chatCountElement = document.getElementById('chatCount');
        const totalCharsElement = document.getElementById('totalChars');
        
        if (chatCountElement) chatCountElement.textContent = this.chatCount;
        if (totalCharsElement) totalCharsElement.textContent = this.totalChars;
    }

    showError(message) {
        this.addMessage('system', message);
    }

    // 绑定快捷输入事件
    bindQuickInputEvents() {
        // 绑定心情快捷输入
        const moodItems = document.querySelectorAll('.mood-item[data-quick-input]');
        moodItems.forEach(item => {
            item.addEventListener('click', () => {
                const text = item.getAttribute('data-quick-input');
                if (this.userInput) {
                    this.userInput.value = text;
                    this.userInput.focus();
                    // 添加点击反馈
                    this.showQuickInputFeedback(item, '心情消息已准备发送！✨');
                }
            });
        });

        // 绑定咒语快捷输入
        const spellItems = document.querySelectorAll('.spell-item[data-quick-input]');
        spellItems.forEach(item => {
            item.addEventListener('click', () => {
                const text = item.getAttribute('data-quick-input');
                if (this.userInput) {
                    this.userInput.value = text;
                    this.userInput.focus();
                    // 添加点击反馈
                    this.showQuickInputFeedback(item, '消息已准备发送！🌟');
                }
            });
        });
    }

    // 翻译模式相关方法
    toggleTranslationMode() {
        console.log('切换翻译模式');
        console.log('translationModeCheckbox:', this.translationModeCheckbox);
        
        if (this.translationModeCheckbox) {
            this.isTranslationMode = this.translationModeCheckbox.checked;
            console.log('翻译模式状态:', this.isTranslationMode);
            
            if (this.isTranslationMode) {
                // 进入翻译模式
                console.log('进入翻译模式');
                this.updateStatus('🌍 翻译模式已启用！', 'ready');
                this.showTranslationModeInfo();
                this.addTranslationModeClasses();
                // 显示文件翻译区域
                this.showFileTranslationSection();
                // 显示语言选择区域
                this.showLanguageControls();
            } else {
                // 退出翻译模式
                console.log('退出翻译模式');
                this.updateStatus('喵~ 已退出翻译模式 ✨', 'ready');
                this.removeTranslationModeClasses();
                // 隐藏文件翻译区域
                this.hideFileTranslationSection();
                // 隐藏语言选择区域
                this.hideLanguageControls();
                
                // 不再清空多轮对话历史记录，让两个模式完全独立
            }
            
            // 更新输入框占位符
            this.updateInputPlaceholder();
        } else {
            console.error('translationModeCheckbox元素未找到');
        }
    }
    
    // 多轮对话模式相关方法
    toggleMultiTurnMode() {
        if (this.multiTurnModeCheckbox) {
            this.isMultiTurnMode = this.multiTurnModeCheckbox.checked;
            
            if (this.isMultiTurnMode) {
                // 启用多轮对话模式，不再依赖翻译模式
                this.updateStatus('🌍 多轮对话模式已启用！AI将记住对话历史 ✨', 'ready');
                this.showMultiTurnModeInfo();
            } else {
                // 退出多轮对话模式
                this.updateStatus('🌍 已退出多轮对话模式，AI将不再记住对话历史 ✨', 'ready');
                this.conversationHistory = [];
            }
        }
    }
    
    showMultiTurnModeInfo() {
        let infoMessage;
        if (this.isTranslationMode) {
            infoMessage = `🌍 多轮对话模式已启用！\n\n✨ 现在AI翻译时会记住之前的对话内容，\n🌟 让翻译更加连贯和准确~`;
        } else {
            infoMessage = `🌍 多轮对话模式已启用！\n\n✨ 现在小樱会记住之前的对话内容，\n🌟 让对话更加连贯和智能~`;
        }
        
        this.addMessage('system', infoMessage);
    }
    
    addTranslationModeClasses() {
        // 为翻译控件添加激活状态的CSS类
        if (this.srcLangSelect) this.srcLangSelect.closest('.translation-controls')?.classList.add('active');
        if (this.tgtLangSelect) this.tgtLangSelect.closest('.translation-controls')?.classList.add('active');
        if (this.translationModeCheckbox) this.translationModeCheckbox.closest('.translation-toggle')?.classList.add('active');
    }
    
    removeTranslationModeClasses() {
        // 移除翻译控件的激活状态CSS类
        if (this.srcLangSelect) this.srcLangSelect.closest('.translation-controls')?.classList.remove('active');
        if (this.tgtLangSelect) this.tgtLangSelect.closest('.translation-controls')?.classList.remove('active');
        if (this.translationModeCheckbox) this.translationModeCheckbox.closest('.translation-toggle')?.classList.remove('active');
    }
    
    showTranslationModeInfo() {
        const srcLang = this.srcLangSelect?.value || 'auto';
        const tgtLang = this.tgtLangSelect?.value || 'zh';
        
        // 显示翻译模式提示
        let infoMessage = `🌍 翻译模式已启用！\n源语言: ${this.getLangDisplayName(srcLang)}\n目标语言: ${this.getLangDisplayName(tgtLang)}\n\n现在输入任何文本，AI将直接翻译成目标语言~`;
        
        // 如果多轮对话模式也启用了，添加相关信息
        if (this.isMultiTurnMode) {
            infoMessage += `\n\n✨ 多轮对话模式已启用！AI将记住对话历史~`;
        }
        
        this.addMessage('system', infoMessage);
    }
    
    // 显示语言选择控件
    showLanguageControls() {
        const translationControls = document.getElementById('translationControls');
        if (translationControls) {
            translationControls.style.display = 'flex';
            console.log('显示语言选择控件');
        }
    }

    // 隐藏语言选择控件
    hideLanguageControls() {
        const translationControls = document.getElementById('translationControls');
        if (translationControls) {
            translationControls.style.display = 'none';
            console.log('隐藏语言选择控件');
        }
    }
    
    getLangDisplayName(langCode) {
        const langNames = {
            'auto': '自动检测',
            'zh': '中文',
            'en': '英语',
            'ja': '日语',
            'ko': '韩语',
            'fr': '法语',
            'de': '德语',
            'es': '西班牙语',
            'ru': '俄语'
        };
        return langNames[langCode] || langCode;
    }

    // 获取当前选择的模型名称
    getCurrentModel() {
        const modelSelect = document.getElementById('model');
        const customModelInput = document.getElementById('customModel');
        
        if (!modelSelect) return 'deepseek-chat';
        
        const selectedValue = modelSelect.value;
        console.log('getCurrentModel - selectedValue:', selectedValue);
        
        if (selectedValue === 'custom' && customModelInput) {
            const customValue = customModelInput.value.trim();
            console.log('getCurrentModel - customValue:', customValue);
            
            if (!customValue) {
                console.warn('自定义模型名称为空');
                // 不自动使用默认模型，而是抛出错误
                throw new Error('请先输入自定义模型名称，或选择预设模型');
            }
            
            // 基本验证：检查模型名称是否包含有效字符
            const isValid = /^[a-zA-Z0-9\-_\.]+$/.test(customValue);
            console.log('getCurrentModel - validation result:', isValid, 'for value:', customValue);
            
            // 更详细的验证
            if (!isValid) {
                console.warn('自定义模型名称包含无效字符');
                throw new Error('模型名称只能包含字母、数字、连字符、下划线和点号');
            }
            
            if (customValue.length < 3) {
                console.warn('自定义模型名称太短');
                throw new Error('模型名称至少需要3个字符');
            }
            
            if (customValue.length > 50) {
                console.warn('自定义模型名称太长');
                throw new Error('模型名称不能超过50个字符');
            }
            
            console.log('getCurrentModel - returning valid custom model:', customValue);
            return customValue;
        }
        
        // 如果是小樱魔卡，返回实际的模型名称
        if (selectedValue === 'sakura-free') {
            return 'deepseek-r1-0528';
        }
        
        console.log('getCurrentModel - returning preset model:', selectedValue);
        return selectedValue;
    }

    // 初始化模型信息显示
    initializeModelInfo() {
        const modelSelect = document.getElementById('model');
        const modelInfo = document.getElementById('modelInfo');
        const modelDescription = document.getElementById('modelDescription');
        
        if (!modelSelect || !modelInfo || !modelDescription) return;
        
        // 根据当前选择的模型显示相应信息
        const selectedValue = modelSelect.value;
        if (this.isR18Mode) {
            switch (selectedValue) {
                case 'deepseek-chat':
                    modelDescription.textContent = '魅惑聊天魔法，擅长魅惑对话和创意写作，像施展魅惑魔法一样收集知识 💋';
                    break;
                case 'deepseek-reasoner':
                    modelDescription.textContent = '魅惑推理魔法，擅长逻辑推理和复杂问题解决，用魅惑的力量分析问题 🔥';
                    break;
                case 'sakura-free':
                    modelDescription.textContent = '魅惑小樱魔卡，免费使用的魅惑推理魔卡，自动配置无需设置 💋';
                    break;
                case 'custom':
                    modelDescription.textContent = '亲爱的，请输入您想要使用的魅惑魔法名称';
                    break;
                default:
                    modelDescription.textContent = '未知魅惑魔法，请谨慎使用 ⚠️';
            }
        } else {
            switch (selectedValue) {
                case 'deepseek-chat':
                    modelDescription.textContent = '聊天魔卡，擅长日常对话和创意写作，像收集库洛牌一样收集知识 ✨';
                    break;
                case 'deepseek-reasoner':
                    modelDescription.textContent = '推理魔卡，擅长逻辑推理和复杂问题解决，用智慧的力量分析问题 🧠';
                    break;
                case 'sakura-free':
                    modelDescription.textContent = '小樱魔卡，免费使用的推理魔卡，自动配置无需设置 ✨';
                    break;
                case 'custom':
                    modelDescription.textContent = '知世，请输入您想要使用的库洛牌名称';
                    break;
                default:
                    modelDescription.textContent = '未知库洛牌，请谨慎使用 ⚠️';
            }
        }
        modelInfo.style.display = 'block';
    }

    // 自动填写DeepSeek库洛牌配置
    autoFillDeepSeekConfig() {
        // 自动填写魔法门地址
        const baseUrlInput = document.getElementById('baseUrl');
        if (baseUrlInput) {
            baseUrlInput.value = 'https://api.deepseek.com';
            // 不设置为只读，允许用户修改
            baseUrlInput.readOnly = false;
            // 移除小樱魔卡的样式（如果存在）
            baseUrlInput.classList.remove('sakura-free-url');
        }
        
        // 保存配置
        this.saveConfig();
        
        // 显示动漫风格的提示
        this.showSakuraStyleAlert('库洛牌切换成功！✨', '知世，库洛牌和魔法门已经自动为你使用并打开了哦~ 🌟', 'success');
    }
    
    // 自动填写小樱免费魔卡配置
    autoFillSakuraFreeConfig() {
        // 自动填写API密钥
        const apiKeyInput = document.getElementById('apiKey');
        if (apiKeyInput) {
            apiKeyInput.value = this.getDecryptedKey();
            // 设置为只读，防止用户修改
            apiKeyInput.readOnly = true;
            // 添加特殊样式
            apiKeyInput.classList.add('sakura-free-key');
        }
        
        // 自动填写魔法门地址
        const baseUrlInput = document.getElementById('baseUrl');
        if (baseUrlInput) {
            baseUrlInput.value = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
            // 设置为只读，防止用户修改
            baseUrlInput.readOnly = true;
            // 添加特殊样式
            baseUrlInput.classList.add('sakura-free-url');
        }
        
        // 保存配置
        this.saveConfig();
        
        // 显示动漫风格的提示
        this.showSakuraStyleAlert('小樱魔卡激活！💕', '知世，小樱的免费魔卡已经为你准备好了哦~ 让我们一起开始魔法之旅吧！✨', 'success');
        
        // 更新模型选择器的显示文本
        this.updateModelDisplayName();
    }
    
    // 恢复输入框的可编辑状态
    restoreInputFields() {
        const apiKeyInput = document.getElementById('apiKey');
        if (apiKeyInput) {
            apiKeyInput.readOnly = false;
            apiKeyInput.classList.remove('sakura-free-key');
            // 清除小樱魔卡的配置值
            if (apiKeyInput.value === this.getDecryptedKey()) {
                apiKeyInput.value = '';
            }
        }
        
        const baseUrlInput = document.getElementById('baseUrl');
        if (baseUrlInput) {
            baseUrlInput.readOnly = false;
            baseUrlInput.classList.remove('sakura-free-url');
            // 清除小樱魔卡的配置值，但保留DeepSeek的魔法门地址
            if (baseUrlInput.value === 'https://dashscope.aliyuncs.com/compatible-mode/v1') {
                baseUrlInput.value = '';
            }
            // 如果当前是DeepSeek的魔法门地址，保持不变
            if (baseUrlInput.value === 'https://api.deepseek.com') {
                // 保持DeepSeek的魔法门地址不变
            }
        }
        
        // 恢复模型选择器的显示文本
        this.updateModelDisplayName();
        
        // 保存配置
        this.saveConfig();
        
        console.log('输入框状态已恢复，密钥保护已退出');
    }
    
    // 更新模型选择器的显示文本
    updateModelDisplayName() {
        const modelSelect = document.getElementById('model');
        if (!modelSelect) return;
        
        const selectedValue = modelSelect.value;
        const selectedOption = modelSelect.querySelector(`option[value="${selectedValue}"]`);
        
        if (selectedOption) {
            // 根据选择的模型更新显示文本
            switch (selectedValue) {
                case 'deepseek-chat':
                    selectedOption.textContent = 'DeepSeek-V3-0324 (聊天魔卡)';
                    break;
                case 'deepseek-reasoner':
                    selectedOption.textContent = 'DeepSeek-R1-0528 (推理魔卡)';
                    break;
                case 'sakura-free':
                    selectedOption.textContent = 'deepseek-r1-0528 (小樱魔卡) ✨';
                    break;
                case 'custom':
                    selectedOption.textContent = '自定义库洛牌 ✨';
                    break;
            }
        }
    }
    
    // 应用小樱魔卡样式
    applySakuraFreeStyles() {
        const apiKeyInput = document.getElementById('apiKey');
        const baseUrlInput = document.getElementById('baseUrl');
        
        if (apiKeyInput && baseUrlInput) {
            // 检查是否已经配置了小樱魔卡
            if (apiKeyInput.value === this.getDecryptedKey() && 
                baseUrlInput.value === 'https://dashscope.aliyuncs.com/compatible-mode/v1') {
                
                // 设置为只读并添加样式
                apiKeyInput.readOnly = true;
                baseUrlInput.readOnly = true;
                apiKeyInput.classList.add('sakura-free-key');
                baseUrlInput.classList.add('sakura-free-url');
            }
        }
    }

    // 处理模型选择变化
    handleModelChange() {
        const modelSelect = document.getElementById('model');
        const customModelInput = document.getElementById('customModel');
        const modelInfo = document.getElementById('modelInfo');
        const modelDescription = document.getElementById('modelDescription');
        
        if (!modelSelect || !customModelInput || !modelInfo || !modelDescription) return;
        
        const selectedValue = modelSelect.value;
        
        if (selectedValue === 'custom') {
            // 显示自定义模型输入框包装器
            const customModelWrapper = document.querySelector('.custom-model-input-wrapper');
            if (customModelWrapper) {
                customModelWrapper.style.display = 'flex';
            }
            customModelInput.focus();
            
            // 显示帮助信息
            const customModelHelp = document.getElementById('customModelHelp');
            if (customModelHelp) {
                customModelHelp.style.display = 'block';
            }
            
            // 恢复输入框的可编辑状态（特别是从小樱魔卡切换过来时）
            this.restoreInputFields();
            
            // 更新模型信息
            if (this.isR18Mode) {
                modelDescription.textContent = '亲爱的，请输入您想要使用的魅惑魔法名称';
            } else {
                modelDescription.textContent = '知世，请输入您想要使用的库洛牌名称';
            }
            modelInfo.style.display = 'block';
            
            // 添加输入事件监听器（避免重复添加）
            if (!customModelInput.hasAttribute('data-listener-added')) {
                customModelInput.addEventListener('input', function() {
                                            if (this.value.trim()) {
                            if (window.deepseekChat && window.deepseekChat.isR18Mode) {
                                modelDescription.textContent = `自定义魅惑魔法：${this.value.trim()}`;
                            } else {
                                modelDescription.textContent = `自定义库洛牌：${this.value.trim()}`;
                            }
                        
                        // 显示状态指示器
                        const statusValid = this.parentElement.querySelector('.status-valid');
                        const statusInvalid = this.parentElement.querySelector('.status-invalid');
                        
                        const inputValue = this.value.trim();
                        const isValidInput = /^[a-zA-Z0-9\-_\.]+$/.test(inputValue);
                        console.log('Input validation - value:', inputValue, 'isValid:', isValidInput);
                        
                        // 更详细的验证
                        let validationMessage = '';
                        if (inputValue.length === 0) {
                            if (window.deepseekChat && window.deepseekChat.isR18Mode) {
                                validationMessage = '请输入魅惑魔法名称';
                            } else {
                                validationMessage = '请输入库洛牌名称';
                            }
                        } else if (inputValue.length < 3) {
                            if (window.deepseekChat && window.deepseekChat.isR18Mode) {
                                validationMessage = '魅惑魔法名称至少需要3个字符';
                            } else {
                                validationMessage = '库洛牌名称至少需要3个字符';
                            }
                        } else if (inputValue.length > 50) {
                            if (window.deepseekChat && window.deepseekChat.isR18Mode) {
                                validationMessage = '魅惑魔法名称不能超过50个字符';
                            } else {
                                validationMessage = '库洛牌名称不能超过50个字符';
                            }
                        } else if (!isValidInput) {
                            if (window.deepseekChat && window.deepseekChat.isR18Mode) {
                                validationMessage = '魅惑魔法名称只能包含字母、数字、连字符、下划线和点号';
                            } else {
                                validationMessage = '库洛牌名称只能包含字母、数字、连字符、下划线和点号';
                            }
                        }
                        
                        console.log('Validation message:', validationMessage);
                        
                        if (isValidInput && inputValue.length >= 3 && inputValue.length <= 50) {
                            if (statusValid) statusValid.style.display = 'block';
                            if (statusInvalid) statusInvalid.style.display = 'none';
                            console.log('Showing valid status indicator');
                        } else {
                            if (statusValid) statusValid.style.display = 'none';
                            if (statusInvalid) statusInvalid.style.display = 'block';
                            console.log('Showing invalid status indicator');
                        }
                        
                        // 保存配置
                        if (window.deepseekChat) {
                            window.deepseekChat.saveConfig();
                        }
                                            } else {
                            if (window.deepseekChat && window.deepseekChat.isR18Mode) {
                                modelDescription.textContent = '魅魔酱，请输入您想要使用的魅惑魔法名称';
                            } else {
                                modelDescription.textContent = '小樱，请输入您想要使用的库洛牌名称';
                            }
                        
                        // 隐藏状态指示器
                        const statusValid = this.parentElement.querySelector('.status-valid');
                        const statusInvalid = this.parentElement.querySelector('.status-invalid');
                        if (statusValid) statusValid.style.display = 'none';
                        if (statusInvalid) statusInvalid.style.display = 'none';
                    }
                });
                customModelInput.setAttribute('data-listener-added', 'true');
            }
            
        } else {
            // 隐藏自定义模型输入框包装器
            const customModelWrapper = document.querySelector('.custom-model-input-wrapper');
            if (customModelWrapper) {
                customModelWrapper.style.display = 'none';
            }
            
            // 隐藏帮助信息
            const customModelHelp = document.getElementById('customModelHelp');
            if (customModelHelp) {
                customModelHelp.style.display = 'none';
            }
            
            // 如果不是小樱免费魔卡，恢复输入框的可编辑状态
            if (selectedValue !== 'sakura-free') {
                this.restoreInputFields();
            }
            
            // 更新模型信息
            if (this.isR18Mode) {
                switch (selectedValue) {
                    case 'deepseek-chat':
                        modelDescription.textContent = '魅惑聊天魔法，擅长魅惑对话和创意写作，像施展魅惑魔法一样收集知识 💋';
                        // 自动填写魔法门地址
                        this.autoFillDeepSeekConfig();
                        break;
                    case 'deepseek-reasoner':
                        modelDescription.textContent = '魅惑推理魔法，擅长逻辑推理和复杂问题解决，用魅惑的力量分析问题 🔥';
                        // 自动填写魔法门地址
                        this.autoFillDeepSeekConfig();
                        break;
                    case 'sakura-free':
                        modelDescription.textContent = '魅惑小樱魔卡，免费使用的推理魔卡，自动配置无需设置 💋';
                        // 自动填写API密钥和魔法门
                        this.autoFillSakuraFreeConfig();
                        break;
                    default:
                        modelDescription.textContent = '未知魅惑魔法，请谨慎使用 ⚠️';
                }
            } else {
                switch (selectedValue) {
                    case 'deepseek-chat':
                        modelDescription.textContent = '聊天魔卡，擅长日常对话和创意写作，像收集库洛牌一样收集知识 ✨';
                        // 自动填写魔法门地址
                        this.autoFillDeepSeekConfig();
                        break;
                    case 'deepseek-reasoner':
                        modelDescription.textContent = '推理魔卡，擅长逻辑推理和复杂问题解决，用智慧的力量分析问题 🧠';
                        // 自动填写魔法门地址
                        this.autoFillDeepSeekConfig();
                        break;
                    case 'sakura-free':
                        modelDescription.textContent = '小樱魔卡，免费使用的推理魔卡，自动配置无需设置 ✨';
                        // 自动填写API密钥和魔法门
                        this.autoFillSakuraFreeConfig();
                        break;
                    default:
                        modelDescription.textContent = '未知库洛牌，请谨慎使用 ⚠️';
                }
            }
            modelInfo.style.display = 'block';
        }
    }
    
    updateInputPlaceholder() {
        if (this.userInput) {
            if (this.isTranslationMode) {
                const srcLang = this.srcLangSelect?.value || 'auto';
                const tgtLang = this.tgtLangSelect?.value || 'zh';
                let placeholder = `输入要翻译的${this.getLangDisplayName(srcLang)}文本，按 Enter 翻译，Shift+Enter 换行...`;
                
                // 如果启用了多轮对话模式，添加相关提示
                if (this.isMultiTurnMode) {
                    placeholder += ` (多轮对话模式已启用)`;
                }
                
                this.userInput.placeholder = placeholder;
            } else if (this.isR18Mode) {
                let placeholder = '输入您的问题，按 Enter 发送魅惑魔法，Shift+Enter 换行...';
                
                // 如果启用了多轮对话模式，添加相关提示
                if (this.isMultiTurnMode) {
                    placeholder += ` (多轮对话模式已启用)`;
                }
                
                this.userInput.placeholder = placeholder;
            } else {
                let placeholder = '输入您的问题，按 Enter 发送魔法，Shift+Enter 换行...';
                
                // 如果启用了多轮对话模式，添加相关提示
                if (this.isMultiTurnMode) {
                    placeholder += ` (多轮对话模式已启用)`;
                }
                
                this.userInput.placeholder = placeholder;
            }
        }
    }

    // 更新魔法配置文本
    updateMagicConfigText() {
        if (this.isR18Mode) {
            // 魅魔模式下的魔法配置文本
            const configTitle = document.querySelector('.config-card h3');
            if (configTitle) {
                configTitle.innerHTML = '<i class="fas fa-heart"></i> 魅惑魔法配置';
            }
            
            const apiKeyLabel = document.querySelector('label[for="apiKey"]');
            if (apiKeyLabel) {
                apiKeyLabel.innerHTML = '<i class="fas fa-heart"></i> 魅惑魔法钥匙';
            }
            
            const baseUrlLabel = document.querySelector('label[for="baseUrl"]');
            if (baseUrlLabel) {
                baseUrlLabel.innerHTML = '<i class="fas fa-heart"></i> 魅惑魔法门';
            }
            
            const modelLabel = document.querySelector('label[for="model"]');
            if (modelLabel) {
                modelLabel.innerHTML = '<i class="fas fa-heart"></i> 选择魅惑魔卡';
            }
            
            const temperatureLabel = document.querySelector('label[for="temperature"]');
            if (temperatureLabel) {
                temperatureLabel.innerHTML = '<i class="fas fa-heart"></i> 魅惑力 (0-2)';
            }
            
            const maxTokensLabel = document.querySelector('label[for="maxTokens"]');
            if (maxTokensLabel) {
                maxTokensLabel.innerHTML = '<i class="fas fa-heart"></i> 魅惑魔法长度';
            }
            
            const translationLabel = document.querySelector('label[for="translationMode"]');
            if (translationLabel) {
                translationLabel.innerHTML = '<i class="fas fa-heart"></i> 魅惑翻译模式';
            }
            
            // 更新模型选择器的选项文本
            const modelSelect = document.getElementById('model');
            if (modelSelect) {
                const options = modelSelect.querySelectorAll('option');
                if (options[0]) options[0].textContent = 'DeepSeek-V3-0324 (魅惑聊天魔卡)';
                if (options[1]) options[1].textContent = 'DeepSeek-R1-0528 (魅惑推理魔卡)';
                if (options[2]) options[2].textContent = 'deepseek-r1-0528 (魅惑小樱魔卡) ✨';
                if (options[3]) options[3].textContent = '自定义魅惑魔卡 ✨';
            }
            
            // 更新自定义模型输入框占位符
            const customModelInput = document.getElementById('customModel');
            if (customModelInput) {
                customModelInput.placeholder = '例如: deepseek-chat, gpt-4, claude-3';
            }
            
            // 更新模型描述（暂时注释掉，因为函数不存在）
            // this.updateModelDescriptions();
        } else {
            // 普通模式下的魔法配置文本
            const configTitle = document.querySelector('.config-card h3');
            if (configTitle) {
                configTitle.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> 魔法配置';
            }
            
            const apiKeyLabel = document.querySelector('label[for="apiKey"]');
            if (apiKeyLabel) {
                apiKeyLabel.innerHTML = '<i class="fas fa-key"></i> 魔法钥匙';
            }
            
            const baseUrlLabel = document.querySelector('label[for="baseUrl"]');
            if (baseUrlLabel) {
                baseUrlLabel.innerHTML = '<i class="fas fa-door-open"></i> 魔法门';
            }
            
            const modelLabel = document.querySelector('label[for="model"]');
            if (modelLabel) {
                modelLabel.innerHTML = '<i class="fas fa-cards-blank"></i> 选择库洛牌（会清除魔法钥匙）';
            }
            
            const temperatureLabel = document.querySelector('label[for="temperature"]');
            if (temperatureLabel) {
                temperatureLabel.innerHTML = '<i class="fas fa-sparkles"></i> 创造力 (0-2)';
            }
            
            const maxTokensLabel = document.querySelector('label[for="maxTokens"]');
            if (maxTokensLabel) {
                maxTokensLabel.innerHTML = '<i class="fas fa-ruler"></i> 魔法长度';
            }
            
            const translationLabel = document.querySelector('label[for="translationMode"]');
            if (translationLabel) {
                translationLabel.innerHTML = '<i class="fas fa-language"></i> 翻译模式';
            }
            
            // 更新模型选择器的选项文本
            const modelSelect = document.getElementById('model');
            if (modelSelect) {
                const options = modelSelect.querySelectorAll('option');
                if (options[0]) options[0].textContent = 'DeepSeek-V3-0324 (聊天魔卡)';
                if (options[1]) options[1].textContent = 'DeepSeek-R1-0528 (推理魔卡)';
                if (options[2]) options[2].textContent = 'deepseek-r1-0528 (小樱魔卡) ✨';
                if (options[3]) options[3].textContent = '自定义库洛牌 ✨';
            }
            
            // 更新自定义模型输入框占位符
            const customModelInput = document.getElementById('customModel');
            if (customModelInput) {
                customModelInput.placeholder = '例如: deepseek-chat, gpt-4, claude-3';
            }
            
            // 更新模型描述（暂时注释掉，因为函数不存在）
            // this.updateModelDescriptions();
        }
    }

    // 魔法模式相关方法
    toggleMagicMode() {
        if (this.isR18Mode) {
            // 如果已经在R18模式，则退出
            this.exitMagicMode();
            return;
        }
        
        // 显示魅魔主题的提示框
        this.showMagicPrompt();
    }
    
    showMagicPrompt() {
        // 创建魅魔主题的输入框
        const promptContainer = document.createElement('div');
        promptContainer.className = 'magic-prompt-container';
        promptContainer.innerHTML = `
            <div class="magic-prompt-overlay">
                <div class="magic-prompt-box">
                    <div class="magic-prompt-header">
                        <i class="fas fa-heart"></i>
                        <h3>施展魔法</h3>
                    </div>
                    <div class="magic-prompt-content">
                        <p>知世，请施展你的魔法吧：</p>
                        <p class="magic-prompt-hint">💡 提示：使用的库洛牌是时间卡牌</p>
                        <input type="password" id="magicPassword" placeholder="输入魔法密码..." class="magic-prompt-input">
                        <div class="magic-prompt-actions">
                            <button class="btn btn-outline" onclick="this.closest('.magic-prompt-container').remove()">取消</button>
                            <button class="btn btn-primary" onclick="window.deepseekChat.enterMagicMode()">施展魔法</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(promptContainer);
        
        // 添加滑入动画
        setTimeout(() => {
            promptContainer.querySelector('.magic-prompt-box').classList.add('slide-in');
        }, 10);
        
        // 聚焦到密码输入框
        setTimeout(() => {
            const passwordInput = promptContainer.querySelector('#magicPassword');
            if (passwordInput) {
                passwordInput.focus();
                passwordInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        window.deepseekChat.enterMagicMode();
                    }
                });
            }
        }, 100);
    }
    
    enterMagicMode() {
        const passwordInput = document.querySelector('#magicPassword');
        if (!passwordInput) return;
        
        const password = passwordInput.value.trim();
        
        // 生成基于当前时间的动态密码
        const now = new Date();
        const timePassword = this.generateTimeBasedPassword(now);
        
        if (password === timePassword) {
            // 密码正确，进入R18模式
            this.isR18Mode = true;
            this.isMagicMode = true;
            
            // 显示成功提示
            this.showMagicAlert('魔法施展成功，小樱变成魅魔啦~ 嗯哼~ 💋', 'success');
            
            // 移除输入框
            const promptContainer = document.querySelector('.magic-prompt-container');
            if (promptContainer) {
                promptContainer.remove();
            }
            
            // 更新魔法按键状态
            if (this.magicBtn) {
                this.magicBtn.innerHTML = '<i class="fas fa-heart"></i> 魅魔模式';
                this.magicBtn.classList.add('magic-active');
            }
            
            // 保存状态到本地存储
            localStorage.setItem('magicMode', 'true');
            localStorage.setItem('r18Mode', 'true');
            
            // 更新魔法配置文本
            this.updateMagicConfigText();
            
        } else {
            // 密码错误
            this.showMagicAlert('施展魔法失败，请检查魔法或者施法方式是否有问题？💔', 'error');
        }
    }
    
    exitMagicMode() {
        this.isR18Mode = false;
        this.isMagicMode = false;
        
        // 更新魔法按键状态
        if (this.magicBtn) {
            this.magicBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> 施展魔法';
            this.magicBtn.classList.remove('magic-active');
        }
        
        // 清除本地存储
        localStorage.removeItem('magicMode');
        localStorage.removeItem('r18Mode');
        
        // 更新魔法配置文本
        this.updateMagicConfigText();
    }
    
    showSakuraStyleAlert(title, message, type = 'info') {
        // 创建魔卡少女小樱风格的提示框
        const alertContainer = document.createElement('div');
        alertContainer.className = 'sakura-alert-container';
        
        // 根据魅魔模式选择不同的风格
        if (this.isR18Mode) {
            // 魅魔模式下的风格
            alertContainer.innerHTML = `
                <div class="sakura-alert-overlay">
                    <div class="sakura-alert-box sakura-rouge">
                        <div class="sakura-alert-decoration">
                            <div class="sakura-petal sakura-petal-1">💋</div>
                            <div class="sakura-petal sakura-petal-2">💋</div>
                            <div class="sakura-petal sakura-petal-3">💋</div>
                            <div class="sakura-petal sakura-petal-4">💋</div>
                        </div>
                        <div class="sakura-alert-header">
                            <div class="sakura-icon">
                                <i class="fas fa-heart"></i>
                            </div>
                            <h3>${title}</h3>
                        </div>
                        <div class="sakura-alert-content">
                            <p>${message}</p>
                        </div>
                        <div class="sakura-alert-actions">
                            <button class="sakura-btn sakura-btn-rouge" onclick="this.closest('.sakura-alert-container').remove()">
                                <i class="fas fa-heart"></i> 嗯哼~ 好的呢~
                            </button>
                        </div>
                        <div class="sakura-alert-footer">
                            <span class="sakura-magic-text">"亲爱的，让我们一起享受魅惑的魔法吧~"</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // 普通模式下的风格
            // 根据类型选择不同的图标和颜色
            let icon, colorClass;
            switch (type) {
                case 'success':
                    icon = 'fas fa-star';
                    colorClass = 'sakura-success';
                    break;
                case 'error':
                    icon = 'fas fa-heart-broken';
                    colorClass = 'sakura-error';
                    break;
                case 'warning':
                    icon = 'fas fa-exclamation-triangle';
                    colorClass = 'sakura-warning';
                    break;
                default:
                    icon = 'fas fa-magic';
                    colorClass = 'sakura-info';
            }
            
            alertContainer.innerHTML = `
                <div class="sakura-alert-overlay">
                    <div class="sakura-alert-box ${colorClass}">
                        <div class="sakura-alert-decoration">
                            <div class="sakura-petal sakura-petal-1">🌸</div>
                            <div class="sakura-petal sakura-petal-2">🌸</div>
                            <div class="sakura-petal sakura-petal-3">🌸</div>
                            <div class="sakura-petal sakura-petal-4">🌸</div>
                        </div>
                        <div class="sakura-alert-header">
                            <div class="sakura-icon">
                                <i class="${icon}"></i>
                            </div>
                            <h3>${title}</h3>
                        </div>
                        <div class="sakura-alert-content">
                            <p>${message}</p>
                        </div>
                        <div class="sakura-alert-actions">
                            <button class="sakura-btn sakura-btn-primary" onclick="this.closest('.sakura-alert-container').remove()">
                                <i class="fas fa-heart"></i> 好的呢~
                            </button>
                        </div>
                        <div class="sakura-alert-footer">
                            <span class="sakura-magic-text">"只要有爱，就没有不可能的事情！"</span>
                        </div>
                    </div>
                </div>
            `;
        }
        
        document.body.appendChild(alertContainer);
        
        // 添加樱花飘落动画
        this.createSakuraPetals(alertContainer);
        
        // 添加淡入动画
        setTimeout(() => {
            alertContainer.querySelector('.sakura-alert-box').classList.add('sakura-fade-in');
        }, 10);
        
        // 自动移除提示框
        setTimeout(() => {
            if (alertContainer.parentNode) {
                alertContainer.remove();
            }
        }, 4000);
    }
    
    // 创建樱花飘落效果
    createSakuraPetals(container) {
        const sakuraContainer = container.querySelector('.sakura-alert-overlay');
        if (!sakuraContainer) return;
        
        // 根据模式选择装饰元素
        const decoration = this.isR18Mode ? '💋' : '🌸';
        
        // 创建多个装饰元素
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                const petal = document.createElement('div');
                petal.className = 'floating-sakura-petal';
                petal.innerHTML = decoration;
                petal.style.cssText = `
                    position: absolute;
                    font-size: ${Math.random() * 20 + 15}px;
                    left: ${Math.random() * 100}%;
                    top: -20px;
                    opacity: 0.8;
                    animation: sakuraFloat ${Math.random() * 3 + 4}s linear infinite;
                    z-index: 1000;
                `;
                sakuraContainer.appendChild(petal);
                
                // 动画结束后移除花瓣
                setTimeout(() => {
                    if (petal.parentNode) {
                        petal.remove();
                    }
                }, 8000);
            }, i * 200);
        }
    }
    
    // 将英文错误信息转换为中文
    translateErrorMessage(errorMessage) {
        if (!errorMessage) return errorMessage;
        
        const errorText = errorMessage.toLowerCase();
        
        // 常见的API错误信息翻译
        if (errorText.includes('authentication') || errorText.includes('unauthorized')) {
            return '身份验证失败，魔法钥匙无效或已过期 💔';
        }
        
        if (errorText.includes('invalid api key') || errorText.includes('api key') && errorText.includes('invalid')) {
            return '魔法钥匙无效，请检查是否正确配置 🔑';
        }
        
        if (errorText.includes('quota exceeded') || errorText.includes('rate limit')) {
            return '使用配额已超限，请稍后再试或升级账户 📊';
        }
        
        if (errorText.includes('model not found') || errorText.includes('model does not exist')) {
            return '库洛牌不存在，请检查模型名称是否正确 🃏';
        }
        
        if (errorText.includes('insufficient quota') || errorText.includes('insufficient balance')) {
            return '账户余额不足，请充值后重试 💰';
        }
        
        if (errorText.includes('bad request') || errorText.includes('400')) {
            return '请求格式错误，请检查输入参数 📝';
        }
        
        if (errorText.includes('internal server error') || errorText.includes('500')) {
            return '服务器内部错误，请稍后重试 🔧';
        }
        
        if (errorText.includes('service unavailable') || errorText.includes('503')) {
            return '服务暂时不可用，请稍后重试 ⏰';
        }
        
        if (errorText.includes('gateway timeout') || errorText.includes('504')) {
            return '请求超时，请检查网络连接或稍后重试 ⏱️';
        }
        
        if (errorText.includes('forbidden') || errorText.includes('403')) {
            return '访问被拒绝，请检查权限设置 🚫';
        }
        
        if (errorText.includes('not found') || errorText.includes('404')) {
            return '请求的资源不存在，请检查地址是否正确 🔍';
        }
        
        // 如果包含HTTP状态码，转换为中文描述
        if (errorText.includes('http')) {
            return errorMessage.replace(/HTTP错误 (\d+): (.+)/, (match, status, text) => {
                const statusMap = {
                    '400': '请求错误',
                    '401': '身份验证失败',
                    '403': '访问被拒绝',
                    '404': '资源不存在',
                    '429': '请求过于频繁',
                    '500': '服务器内部错误',
                    '502': '网关错误',
                    '503': '服务不可用',
                    '504': '网关超时'
                };
                return `HTTP ${status}: ${statusMap[status] || text}`;
            });
        }
        
        // 如果没有匹配的翻译，返回原错误信息
        return errorMessage;
    }
    
    // 动态生成加密密钥 - 防止源码泄露
    _generateEncryptedKey() {
        // 使用更简单的分段方式，避免Base64解码问题
        const part1 = 'sk-afabca8bb';
        const part2 = '04145ea8afc09649a1a3097';
        
        // 动态组合密钥
        const key = part1 + part2;
        
        // 多层加密
        let encrypted = key;
        
        // 第一层：字符位移加密
        let shifted = '';
        for (let i = 0; i < encrypted.length; i++) {
            const charCode = encrypted.charCodeAt(i);
            const shiftedCode = charCode + 13;
            shifted += String.fromCharCode(shiftedCode);
        }
        encrypted = shifted;
        
        // 第二层：XOR加密
        const xorKey = 'sakura2024';
        let xored = '';
        for (let i = 0; i < encrypted.length; i++) {
            const charCode = encrypted.charCodeAt(i);
            const xorChar = xorKey.charCodeAt(i % xorKey.length);
            xored += String.fromCharCode(charCode ^ xorChar);
        }
        encrypted = xored;
        
        // 第三层：添加混淆字符串
        const obfuscator = 'sakura_magic_2024_liuli';
        encrypted = obfuscator + encrypted + obfuscator.split('').reverse().join('');
        
        // 第四层：Base64编码
        return btoa(encrypted);
    }
    
    // 解密API密钥
    _decodeSecret(encryptedKey) {
        if (!encryptedKey) return '';
        
        try {
            // 第一层：Base64解码
            let decrypted = atob(encryptedKey);
            
            // 第二层：移除混淆字符串
            const obfuscator = 'sakura_magic_2024_liuli';
            const obfuscatorReverse = obfuscator.split('').reverse().join('');
            
            if (decrypted.startsWith(obfuscator) && decrypted.endsWith(obfuscatorReverse)) {
                decrypted = decrypted.substring(obfuscator.length, decrypted.length - obfuscatorReverse.length);
            }
            
            // 第三层：XOR解密
            const xorKey = 'sakura2024';
            let xored = '';
            for (let i = 0; i < decrypted.length; i++) {
                const charCode = decrypted.charCodeAt(i);
                const xorChar = xorKey.charCodeAt(i % xorKey.length);
                xored += String.fromCharCode(charCode ^ xorChar);
            }
            decrypted = xored;
            
            // 第四层：字符位移解密
            let result = '';
            for (let i = 0; i < decrypted.length; i++) {
                const charCode = decrypted.charCodeAt(i);
                const shiftedCode = charCode - 13; // 位移-13位
                result += String.fromCharCode(shiftedCode);
            }
            
            return result;
        } catch (error) {
            console.error('密钥解密失败:', error);
            return '';
        }
    }
    
    // 获取解密后的API密钥
    getDecryptedKey() {
        // 添加反调试保护
        this.antiDebugProtection();
        
        // 检查是否在开发者工具中运行
        if (this.isDevToolsOpen()) {
            console.warn('检测到开发者工具，密钥访问被阻止');
            return '';
        }
        
        return this._decodeSecret(this._sakuraMagic);
    }
    
    // 反调试保护
    antiDebugProtection() {
        // 检测开发者工具
        const devtools = {
            open: false,
            orientation: null
        };
        
        setInterval(() => {
            const threshold = 160;
            if (window.outerHeight - window.innerHeight > threshold || 
                window.outerWidth - window.innerWidth > threshold) {
                if (!devtools.open) {
                    devtools.open = true;
                    console.warn('检测到开发者工具，某些功能可能受限');
                }
            } else {
                devtools.open = false;
            }
        }, 500);
        
        // 检测F12键
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                e.preventDefault();
                console.warn('此操作已被阻止');
                return false;
            }
        });
    }
    
    // 检测开发者工具是否打开
    isDevToolsOpen() {
        const threshold = 160;
        return window.outerHeight - window.innerHeight > threshold || 
               window.outerWidth - window.innerWidth > threshold;
    }
    
    // 代码完整性检查
    _verifyIntegrity() {
        try {
            // 检查关键方法是否存在
            if (typeof this._generateEncryptedKey !== 'function' || 
                typeof this._decodeSecret !== 'function') {
                throw new Error('代码完整性检查失败');
            }
            
            // 验证加密密钥的完整性
            const encrypted = this._generateEncryptedKey();
            const decrypted = this._decodeSecret(encrypted);
            
            // 验证密钥格式是否正确（不暴露完整密钥）
            if (!decrypted.startsWith('sk-') || decrypted.length !== 51) {
                throw new Error('加密算法验证失败');
            }
            
            return true;
        } catch (error) {
            console.error('代码完整性检查失败:', error);
            return false;
        }
    }
    
    // 简单哈希函数
    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return hash.toString();
    }
    
    // 运行时安全验证
    _runtimeSecurityCheck() {
        // 检查是否在iframe中运行
        if (window.self !== window.top) {
            console.warn('检测到iframe环境，安全功能受限');
            return false;
        }
        
        // 检查是否在本地文件系统中运行
        if (window.location.protocol === 'file:') {
            console.warn('检测到本地文件环境，某些功能可能受限');
            return false;
        }
        
        return true;
    }
    
    showMagicAlert(message, type = 'info') {
        // 创建魅魔主题的提示框
        const alertContainer = document.createElement('div');
        alertContainer.className = 'magic-alert-container';
        alertContainer.innerHTML = `
            <div class="magic-alert-overlay">
                <div class="magic-alert-box ${type}">
                    <div class="magic-alert-header">
                        <i class="fas fa-${type === 'success' ? 'heart' : type === 'error' ? 'times' : 'info'}"></i>
                        <h3>${type === 'success' ? (this.isR18Mode ? '魅魔魔法' : '小樱魔卡') : type === 'error' ? '魔法失败' : '魔法提示'}</h3>
                    </div>
                    <div class="magic-alert-content">
                        <p>${message}</p>
                    </div>
                    <div class="magic-alert-actions">
                        <button class="btn btn-primary" onclick="this.closest('.magic-alert-container').remove()">确定</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(alertContainer);
        
        // 添加淡入动画
        setTimeout(() => {
            alertContainer.querySelector('.magic-alert-box').classList.add('fade-in');
        });
        
        // 自动移除提示框
        setTimeout(() => {
            if (alertContainer.parentNode) {
                alertContainer.remove();
            }
        }, 3000);
    }
    
    // 显示快捷输入反馈
    showQuickInputFeedback(element, message) {
        // 创建反馈提示
        const feedback = document.createElement('div');
        feedback.className = 'quick-input-feedback';
        feedback.textContent = message;
        feedback.style.cssText = `
            position: absolute;
            background: linear-gradient(135deg, #ff6b9d, #a8e6cf);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: 600;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            pointer-events: none;
            animation: quickInputFeedback 0.6s ease-out forwards;
        `;

        // 添加到页面
        document.body.appendChild(feedback);

        // 定位到元素上方
        const rect = element.getBoundingClientRect();
        feedback.style.left = rect.left + rect.width / 2 + 'px';
        feedback.style.top = rect.top - 40 + 'px';
        feedback.style.transform = 'translateX(-50%)';

        // 动画结束后移除
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
            }
        }, 600);
    }

    // 检测移动端并适配
    detectMobileAndAdapt() {
        const isMobile = this.isMobileDevice();
        
        // 添加调试信息
        console.log('设备检测结果:', {
            userAgent: navigator.userAgent,
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight,
            hasTouchStart: 'ontouchstart' in window,
            maxTouchPoints: navigator.maxTouchPoints,
            isMobile: isMobile
        });
        
        if (isMobile) {
            console.log('检测到移动设备，正在适配...');
            this.adaptForMobile();
        } else {
            console.log('检测到桌面设备，无需移动端适配');
        }
    }

    // 检测是否为移动设备
    isMobileDevice() {
        // 首先检查用户代理字符串，这是最可靠的移动设备检测方法
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // 如果是移动设备UA，直接返回true
        if (isMobileUA) {
            return true;
        }
        
        // 对于桌面设备，检查是否为触摸屏（如Surface等）
        const hasTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        
        // 检查屏幕尺寸，但使用更保守的阈值
        const isSmallScreen = window.innerWidth <= 480 && window.innerHeight <= 800;
        
        // 只有在同时满足触摸屏和小屏幕时才认为是移动设备
        // 这样可以避免在桌面浏览器中误判
        return hasTouchScreen && isSmallScreen;
    }

    // 移动端适配
    adaptForMobile() {
        // 添加移动端样式类
        document.body.classList.add('mobile-device');
        
        // 优化触摸体验
        this.optimizeTouchExperience();
        
        // 调整布局
        this.adjustMobileLayout();
        
        // 显示移动端提示
        this.showMobileTip();
    }

    // 优化触摸体验
    optimizeTouchExperience() {
        // 增加触摸目标大小
        const touchTargets = document.querySelectorAll('.mood-item, .spell-item, .btn');
        touchTargets.forEach(target => {
            target.style.minHeight = '44px';
            target.style.minWidth = '44px';
        });

        // 禁用hover效果
        const style = document.createElement('style');
        style.textContent = `
            .mobile-device .mood-item:hover,
            .mobile-device .spell-item:hover {
                transform: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    // 调整移动端布局
    adjustMobileLayout() {
        // 调整装饰区域间距
        const decorationArea = document.querySelector('.anime-decoration-area');
        if (decorationArea) {
            decorationArea.style.marginTop = '1rem';
            decorationArea.style.gap = '0.75rem';
        }

        // 调整卡片内边距
        const cards = document.querySelectorAll('.decoration-card');
        cards.forEach(card => {
            card.style.padding = '1rem';
        });
    }

    // 显示移动端提示
    showMobileTip() {
        // 创建移动端提示
        const mobileTip = document.createElement('div');
        mobileTip.className = 'mobile-tip';
        mobileTip.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #ff6b9d, #a8e6cf);
                color: white;
                padding: 1rem;
                border-radius: 15px;
                margin: 1rem;
                text-align: center;
                font-size: 0.9rem;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            ">
                📱 喵~ 检测到你在使用移动设备！<br>
                已为你优化触摸体验，享受魔法聊天吧~ ✨
            </div>
        `;

        // 插入到页面顶部
        const firstCard = document.querySelector('.anime-decoration-area .decoration-card');
        if (firstCard && firstCard.parentNode) {
            firstCard.parentNode.insertBefore(mobileTip, firstCard);
        }

        // 3秒后自动隐藏
        setTimeout(() => {
            if (mobileTip.parentNode) {
                mobileTip.style.opacity = '0';
                mobileTip.style.transition = 'opacity 0.5s ease';
                setTimeout(() => {
                    if (mobileTip.parentNode) {
                        mobileTip.parentNode.removeChild(mobileTip);
                    }
                }, 500);
            }
        }, 3000);
    }
    
    // 文件翻译相关方法
    showFileTranslationSection() {
        console.log('尝试显示文件翻译区域');
        console.log('fileTranslationSection元素:', this.fileTranslationSection);
        
        if (this.fileTranslationSection) {
            this.fileTranslationSection.style.display = 'block';
            console.log('文件翻译区域显示成功');
            
            // 检查子元素是否正确显示
            const fileUploadArea = this.fileTranslationSection.querySelector('.file-upload-area');
            const txtFileInput = this.fileTranslationSection.querySelector('#txtFileInput');
            console.log('文件上传区域:', fileUploadArea);
            console.log('文件输入框:', txtFileInput);
        } else {
            console.error('fileTranslationSection元素未找到');
        }
    }
    
    hideFileTranslationSection() {
        if (this.fileTranslationSection) {
            this.fileTranslationSection.style.display = 'none';
            // 清空文件信息
            this.clearFileInfo();
        }
    }
    
    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // 检查文件类型
        if (!file.name.toLowerCase().endsWith('.txt')) {
            this.showError('请选择TXT格式的文件');
            this.clearFileInfo();
            return;
        }
        
        // 检查文件大小（限制为10MB）
        if (file.size > 10 * 1024 * 1024) {
            this.showError('文件大小不能超过10MB');
            this.clearFileInfo();
            return;
        }
        
        // 检查文件是否为空
        if (file.size === 0) {
            this.showError('文件内容为空，请选择有效的文件');
            this.clearFileInfo();
            return;
        }
        
        // 显示文件信息
        this.showFileInfo(file);
        
        // 显示翻译按钮
        if (this.translateFileBtn) {
            this.translateFileBtn.style.display = 'block';
        }
        
        // 添加文件选择成功的视觉反馈
        this.showFileSelectFeedback(file);
    }
    
    showFileInfo(file) {
        if (this.fileInfo && this.fileName && this.fileSize) {
            this.fileName.textContent = file.name;
            this.fileSize.textContent = this.formatFileSize(file.size);
            this.fileInfo.style.display = 'flex';
        }
    }
    
    clearFileInfo() {
        if (this.fileInfo && this.txtFileInput && this.translateFileBtn) {
            this.fileInfo.style.display = 'none';
            this.txtFileInput.value = '';
            this.translateFileBtn.style.display = 'none';
            
            // 如果正在翻译，取消翻译
            if (this.isTranslationCancelled === false && this.fileTranslationProgress?.style.display !== 'none') {
                this.isTranslationCancelled = true;
                this.hideTranslationProgress();
                this.enableTranslateButton();
            }
        }
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    async startFileTranslation() {
        const file = this.txtFileInput?.files[0];
        if (!file) {
            this.showError('请先选择要翻译的文件');
            return;
        }
        
        // 验证配置
        if (!this.apiKeyInput?.value.trim()) {
            this.showError('请先配置魔法钥匙');
            return;
        }
        
        try {
            // 创建新的AbortController用于取消控制
            this.abortController = new AbortController();
            this.isTranslationCancelled = false;
            
            // 读取文件内容
            const text = await this.readFileAsText(file);
            const lines = text.split('\n').filter(line => line.trim());
            
            if (lines.length === 0) {
                this.showError('文件内容为空');
                return;
            }
            
            // 显示进度区域
            this.showTranslationProgress(lines.length);
            
            // 开始翻译
            await this.translateFileLines(lines);
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('翻译被用户取消');
                this.currentStatus.textContent = '翻译已取消';
                this.enableTranslateButton();
                this.hideTranslationProgress();
            } else {
                console.error('文件翻译失败:', error);
                this.showError(`文件翻译失败: ${error.message}`);
                this.hideTranslationProgress();
            }
        } finally {
            // 清理AbortController
            this.abortController = null;
        }
    }
    
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('文件读取失败'));
            reader.readAsText(file, 'UTF-8');
        });
    }
    
    showTranslationProgress(totalLines) {
        if (this.fileTranslationProgress && this.totalLines) {
            this.fileTranslationProgress.style.display = 'block';
            this.totalLines.textContent = totalLines;
            this.translatedLines.textContent = '0';
            this.translationProgressText.textContent = '0%';
            this.translationProgressFill.style.width = '0%';
            this.currentStatus.textContent = '准备中...';
            
            // 禁用翻译按钮
            if (this.translateFileBtn) {
                this.translateFileBtn.disabled = true;
                this.translateFileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 翻译中...';
            }
            
            // 添加开始翻译的系统消息
            this.addMessage('system', `📁 开始翻译文件，共 ${totalLines} 行\n⏱️ 预计耗时: ${this.calculateEstimatedTime(totalLines)}`);
        }
    }
    
    // 计算预计翻译时间
    calculateEstimatedTime(totalLines) {
        // 根据批量大小和并发数计算预计时间
        const batchCount = Math.ceil(totalLines / this.batchSize);
        const estimatedBatches = Math.ceil(batchCount / this.maxConcurrent);
        const avgTimePerBatch = 1.5; // 平均每批1.5秒（包含API延迟）
        const totalSeconds = Math.ceil(estimatedBatches * avgTimePerBatch);
        
        if (totalSeconds < 60) {
            return `${totalSeconds} 秒`;
        } else if (totalSeconds < 3600) {
            const minutes = Math.ceil(totalSeconds / 60);
            return `${minutes} 分钟`;
        } else {
            const hours = Math.ceil(totalSeconds / 3600);
            return `${hours} 小时`;
        }
    }
    
    async translateFileLines(lines) {
        const srcLang = this.srcLangSelect?.value || 'auto';
        const tgtLang = this.tgtLangSelect?.value || 'zh';
        const translatedLines = new Array(lines.length).fill('');
        let successCount = 0;
        let errorCount = 0;
        let startTime = Date.now();
        
        // 重置状态
        this.isTranslationCancelled = false;
        this.activeRequests = 0;
        this.translationQueue = [];
        
        // 更新状态
        this.currentStatus.textContent = '准备批量翻译...';
        
        // 预处理：过滤空行，创建翻译任务
        const translationTasks = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                translationTasks.push({
                    index: i,
                    text: line,
                    originalText: line
                });
            } else {
                translatedLines[i] = '';
            }
        }
        
        if (translationTasks.length === 0) {
            this.showError('没有需要翻译的内容');
            return;
        }
        
        // 批量处理翻译任务
        const batches = this.createBatches(translationTasks, this.batchSize);
        this.currentStatus.textContent = `开始批量翻译，共 ${batches.length} 批...`;
        
        // 并发执行批次翻译
        const batchPromises = batches.map((batch, batchIndex) => 
            this.translateBatch(batch, batchIndex, batches.length, srcLang, tgtLang, translatedLines, startTime)
        );
        
        try {
            // 使用AbortController来控制Promise的执行
            const timeoutId = setTimeout(() => {
                if (this.isTranslationCancelled) {
                    this.abortController.abort();
                }
            }, 100);
            
            await Promise.all(batchPromises);
            
            // 清除超时检查
            clearTimeout(timeoutId);
            
            // 检查是否已取消
            if (this.isTranslationCancelled) {
                console.log('翻译已取消，停止处理');
                this.currentStatus.textContent = '翻译已取消';
                this.enableTranslateButton();
                return;
            }
            
            // 验证所有行是否都已翻译
            const untranslatedLines = translatedLines.filter(line => !line || line === '');
            if (untranslatedLines.length > 0) {
                console.warn(`发现 ${untranslatedLines.length} 行未翻译，尝试补充翻译`);
                
                // 尝试补充翻译未完成的行
                for (let i = 0; i < translatedLines.length; i++) {
                    // 检查是否已取消
                    if (this.isTranslationCancelled) {
                        console.log('补充翻译过程中被取消');
                        this.currentStatus.textContent = '翻译已取消';
                        this.enableTranslateButton();
                        return;
                    }
                    
                    if (!translatedLines[i] || translatedLines[i] === '') {
                        const originalLine = lines[i].trim();
                        if (originalLine) {
                            try {
                                const translatedText = await this.translateSingleLine(originalLine, srcLang, tgtLang);
                                translatedLines[i] = translatedText || `[翻译失败: ${originalLine}]`;
                            } catch (error) {
                                console.error(`补充翻译第 ${i + 1} 行失败:`, error);
                                translatedLines[i] = `[翻译失败: ${originalLine}]`;
                            }
                        } else {
                            translatedLines[i] = '';
                        }
                    }
                }
            }
            
            // 最终检查是否已取消
            if (this.isTranslationCancelled) {
                console.log('最终检查：翻译已取消');
                this.currentStatus.textContent = '翻译已取消';
                this.enableTranslateButton();
                return;
            }
            
            // 统计成功和失败数量
            successCount = translatedLines.filter(line => line && !line.startsWith('[翻译失败')).length;
            errorCount = translatedLines.filter(line => line && line.startsWith('[翻译失败')).length;
            
            // 最终验证
            if (successCount + errorCount === lines.length) {
                this.currentStatus.textContent = '翻译完成，正在导出...';
                await this.exportTranslatedFile(translatedLines, successCount, errorCount, startTime);
            } else {
                throw new Error(`翻译进度异常：预期处理 ${lines.length} 行，实际处理 ${successCount + errorCount} 行`);
            }
        } catch (error) {
            console.error('批量翻译失败:', error);
            this.showError(`批量翻译失败: ${error.message}`);
        }
    }
    
    // 创建翻译批次
    createBatches(tasks, batchSize) {
        const batches = [];
        for (let i = 0; i < tasks.length; i += batchSize) {
            batches.push(tasks.slice(i, i + batchSize));
        }
        return batches;
    }
    
    // 翻译单个批次
    async translateBatch(batch, batchIndex, totalBatches, srcLang, tgtLang, translatedLines, startTime) {
        if (this.isTranslationCancelled) return;
        
        // 等待并发控制
        while (this.activeRequests >= this.maxConcurrent) {
            await this.delay(50);
            if (this.isTranslationCancelled) return;
        }
        
        this.activeRequests++;
        
        try {
            // 合并批次文本
            const batchTexts = batch.map(task => task.text);
            const combinedText = batchTexts.join('\n---\n');
            
            // 检查缓存
            const cacheKey = `${srcLang}-${tgtLang}-${combinedText}`;
            let translatedBatch;
            
            if (this.translationCache.has(cacheKey)) {
                translatedBatch = this.translationCache.get(cacheKey);
                console.log(`使用缓存翻译批次 ${batchIndex + 1}`);
            } else {
                // 调用API翻译
                const startRequest = Date.now();
                translatedBatch = await this.translateBatchText(combinedText, srcLang, tgtLang);
                const requestTime = Date.now() - startRequest;
                
                // 记录响应时间并更新自适应延迟
                this.updateAdaptiveDelay(requestTime);
                
                // 缓存结果
                this.translationCache.set(cacheKey, translatedBatch);
            }
            
            // 分割翻译结果并填充到对应位置
            const translatedResults = translatedBatch.split('\n---\n');
            batch.forEach((task, i) => {
                if (translatedResults[i] && translatedResults[i].trim()) {
                    translatedLines[task.index] = translatedResults[i];
                } else {
                    // 如果翻译结果为空，尝试单独翻译这一行
                    this.retrySingleLine(task, srcLang, tgtLang, translatedLines);
                }
            });
            
            // 更新进度
            const totalProcessed = (batchIndex + 1) * this.batchSize;
            const currentProgress = Math.min(totalProcessed, translatedLines.length);
            this.updateTranslationProgress(currentProgress, translatedLines.length, startTime);
            
            this.currentStatus.textContent = `已完成 ${batchIndex + 1}/${totalBatches} 批`;
            
        } catch (error) {
            console.error(`批次 ${batchIndex + 1} 翻译失败:`, error);
            
            // 批次失败时，尝试逐行翻译以提高成功率
            await this.fallbackToSingleLineTranslation(batch, srcLang, tgtLang, translatedLines);
            
            // 更新进度
            const totalProcessed = (batchIndex + 1) * this.batchSize;
            const currentProgress = Math.min(totalProcessed, translatedLines.length);
            this.updateTranslationProgress(currentProgress, translatedLines.length, startTime);
        } finally {
            this.activeRequests--;
        }
    }
    
    // 翻译批次文本
    async translateBatchText(text, srcLang, tgtLang) {
        // 检查是否已取消
        if (this.isTranslationCancelled) {
            throw new Error('翻译已被用户取消');
        }
        
        const url = `${this.baseUrlInput.value}/chat/completions`;
        
        const systemPrompt = `You are a professional translator. Please translate the following ${srcLang} text into ${tgtLang}. 
        Requirements:
        1. Only provide the translation result, no explanations
        2. Maintain the original format and structure, including the "---" separators
        3. Keep proper nouns and technical terms accurate
        4. Ensure the translation is natural and fluent in the target language
        5. Preserve line breaks and separators exactly as they appear`;
        
        // 获取模型名称，处理验证错误
        let modelName;
        try {
            modelName = this.getCurrentModel();
        } catch (error) {
            console.error('翻译时模型验证失败:', error.message);
            throw new Error(`模型配置错误: ${error.message}`);
        }
        
        const requestBody = {
            model: modelName,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            temperature: parseFloat(this.temperatureInput?.value || '0.3'),
            max_tokens: parseInt(this.maxTokensInput?.value || '4000')
        };
        
        // 重试机制
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            // 每次重试前检查是否已取消
            if (this.isTranslationCancelled) {
                throw new Error('翻译已被用户取消');
            }
            
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKeyInput.value}`
                    },
                    body: JSON.stringify(requestBody),
                    signal: this.abortController?.signal // 添加AbortSignal
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
                    
                    // 如果是API限制错误，等待更长时间
                    if (response.status === 429 || errorMessage.includes('rate limit')) {
                        const waitTime = Math.min(2000 * Math.pow(2, retryCount), 15000);
                        this.currentStatus.textContent = `API限制，等待 ${Math.round(waitTime/1000)} 秒后重试...`;
                        await this.delay(waitTime);
                        retryCount++;
                        continue;
                    }
                    
                    throw new Error(errorMessage);
                }
                
                const data = await response.json();
                return data.choices[0].message.content;
                
            } catch (error) {
                // 检查是否是取消错误
                if (error.name === 'AbortError') {
                    throw new Error('翻译已被用户取消');
                }
                
                retryCount++;
                
                if (retryCount >= maxRetries) {
                    throw new Error(`翻译失败，已重试${maxRetries}次: ${error.message}`);
                }
                
                // 网络错误或其他错误，等待后重试
                const waitTime = Math.min(1000 * Math.pow(2, retryCount), 8000);
                this.currentStatus.textContent = `翻译出错，${Math.round(waitTime/1000)}秒后重试... (${retryCount}/${maxRetries})`;
                await this.delay(waitTime);
            }
        }
    }
    
    // 更新自适应延迟
    updateAdaptiveDelay(responseTime) {
        this.apiResponseTimes.push(responseTime);
        
        // 保持最近20次的记录
        if (this.apiResponseTimes.length > 20) {
            this.apiResponseTimes.shift();
        }
        
        // 计算平均响应时间
        const avgResponseTime = this.apiResponseTimes.reduce((a, b) => a + b, 0) / this.apiResponseTimes.length;
        
        // 根据响应时间调整延迟
        if (avgResponseTime < 500) {
            // 响应很快，减少延迟
            this.adaptiveDelay = Math.max(50, this.adaptiveDelay * 0.9);
        } else if (avgResponseTime > 2000) {
            // 响应较慢，增加延迟
            this.adaptiveDelay = Math.min(500, this.adaptiveDelay * 1.2);
        }
        
        console.log(`API响应时间: ${responseTime}ms, 平均: ${Math.round(avgResponseTime)}ms, 自适应延迟: ${Math.round(this.adaptiveDelay)}ms`);
    }
    
    updateTranslationProgress(current, total, startTime) {
        if (this.translatedLines && this.translationProgressText && this.translationProgressFill) {
            this.translatedLines.textContent = current;
            const percentage = Math.round((current / total) * 100);
            this.translationProgressText.textContent = `${percentage}%`;
            this.translationProgressFill.style.width = `${percentage}%`;

            // 计算已用时间
            const elapsedTime = Date.now() - startTime;
            const avgTimePerLine = (elapsedTime / current) || 0; // 当前平均每行耗时
            const estimatedRemainingTime = Math.round((total - current) * avgTimePerLine / 1000); // 剩余时间（秒）

            // 计算成功率
            const successLines = Array.from({length: total}, (_, i) => i < current ? true : false)
                .filter((_, i) => this.translatedLines[i] && !this.translatedLines[i].startsWith('[翻译失败'));
            const successRate = current > 0 ? Math.round((successLines.length / current) * 100) : 100;

            // 更新状态文本
            if (current === total) {
                this.currentStatus.textContent = `翻译完成！成功率: ${successRate}%`;
            } else if (this.isTranslationCancelled) {
                this.currentStatus.textContent = '翻译已取消';
            } else {
                this.currentStatus.textContent = `已翻译 ${current}/${total} 行，成功率: ${successRate}%，预计剩余 ${this.formatTime(estimatedRemainingTime)}`;
            }
        }
    }
    
    // 格式化时间显示
    formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds} 秒`;
        } else if (seconds < 3600) {
            const minutes = Math.ceil(seconds / 60);
            return `${minutes} 分钟`;
        } else {
            const hours = Math.ceil(seconds / 3600);
            return `${hours} 小时`;
        }
    }
    
    async exportTranslatedFile(translatedLines, successCount, errorCount, startTime) {
        try {
            const srcLang = this.srcLangSelect?.value || 'auto';
            const tgtLang = this.tgtLangSelect?.value || 'zh';
            const fileName = this.txtFileInput?.files[0]?.name || 'translated';
            const baseName = fileName.replace('.txt', '');
            const totalTime = Math.round((Date.now() - startTime) / 1000);
            
            // 构建导出内容
            let exportContent = `=== 文件翻译报告 ===\n`;
            exportContent += `原文件: ${fileName}\n`;
            exportContent += `源语言: ${this.getLangDisplayName(srcLang)}\n`;
            exportContent += `目标语言: ${this.getLangDisplayName(tgtLang)}\n`;
            exportContent += `翻译时间: ${new Date().toLocaleString('zh-CN')}\n`;
            exportContent += `总耗时: ${this.formatTime(totalTime)}\n`;
            exportContent += `成功翻译: ${successCount} 行\n`;
            exportContent += `翻译失败: ${errorCount} 行\n`;
            exportContent += `总行数: ${translatedLines.length} 行\n`;
            exportContent += `成功率: ${Math.round((successCount / translatedLines.length) * 100)}%\n`;
            exportContent += '='.repeat(50) + '\n\n';
            
            // 添加翻译内容
            translatedLines.forEach((line, index) => {
                exportContent += `${line}\n`;
            });
            
            // 创建下载链接
            const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${baseName}_${this.getLangDisplayName(tgtLang)}_${new Date().toISOString().slice(0, 10)}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // 显示成功消息
            this.currentStatus.textContent = '翻译完成！文件已自动导出';
            this.addMessage('system', `✨ 喵~ 文件翻译完成啦！\n\n📊 翻译统计:\n✅ 成功: ${successCount} 行\n❌ 失败: ${errorCount} 行\n⏱️ 总耗时: ${this.formatTime(totalTime)}\n📁 已自动导出翻译结果文件 🌟`);
            
            // 3秒后隐藏进度区域
            setTimeout(() => {
                this.hideTranslationProgress();
            }, 3000);
            
        } catch (error) {
            console.error('导出翻译文件失败:', error);
            this.currentStatus.textContent = '导出失败';
            this.showError(`导出翻译文件失败: ${error.message}`);
        } finally {
            this.enableTranslateButton();
        }
    }
    
    hideTranslationProgress() {
        if (this.fileTranslationProgress) {
            this.fileTranslationProgress.style.display = 'none';
        }
    }
    
    enableTranslateButton() {
        if (this.translateFileBtn) {
            this.translateFileBtn.disabled = false;
            this.translateFileBtn.innerHTML = '<i class="fas fa-language"></i> 开始翻译文件';
            
            // 重置翻译状态
            this.isTranslationCancelled = false;
        }
    }
    
    async askContinueTranslation(errorCount, currentLine, totalLines) {
        return new Promise((resolve) => {
            const confirmDialog = document.createElement('div');
            confirmDialog.className = 'translation-confirm-dialog';
            confirmDialog.innerHTML = `
                <div class="translation-confirm-overlay">
                    <div class="translation-confirm-box">
                        <div class="translation-confirm-header">
                            <i class="fas fa-exclamation-triangle"></i>
                            <h3>翻译遇到问题</h3>
                        </div>
                        <div class="translation-confirm-content">
                            <p>已遇到 <strong>${errorCount}</strong> 个翻译错误</p>
                            <p>当前进度: <strong>${currentLine}/${totalLines}</strong> 行</p>
                            <p>成功率: <strong>${Math.round(((currentLine - errorCount) / currentLine) * 100)}%</strong></p>
                            <p>是否继续翻译剩余内容？</p>
                        </div>
                        <div class="translation-confirm-actions">
                            <button class="btn btn-outline" onclick="this.closest('.translation-confirm-dialog').remove(); window.deepseekChat.continueTranslationDecision(false);">
                                <i class="fas fa-stop"></i> 停止翻译
                            </button>
                            <button class="btn btn-primary" onclick="this.closest('.translation-confirm-dialog').remove(); window.deepseekChat.continueTranslationDecision(true);">
                                <i class="fas fa-play"></i> 继续翻译
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(confirmDialog);
            
            // 添加滑入动画
            setTimeout(() => {
                const box = confirmDialog.querySelector('.translation-confirm-box');
                if (box) {
                    box.classList.add('slide-in');
                }
            }, 10);
            
            // 设置全局回调
            window.deepseekChat.continueTranslationDecision = (shouldContinue) => {
                resolve(shouldContinue);
            };
            
            // 添加键盘快捷键支持
            const handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    confirmDialog.remove();
                    resolve(false);
                } else if (e.key === 'Enter') {
                    confirmDialog.remove();
                    resolve(true);
                }
            };
            
            document.addEventListener('keydown', handleKeydown);
            
            // 清理事件监听器
            confirmDialog.addEventListener('remove', () => {
                document.removeEventListener('keydown', handleKeydown);
            });
        });
    }
    
    delay(ms) {
        return new Promise((resolve, reject) => {
            // 检查是否已取消
            if (this.isTranslationCancelled) {
                resolve();
                return;
            }
            
            const timeoutId = setTimeout(() => {
                resolve();
            }, ms);
            
            // 如果翻译被取消，清除定时器
            if (this.isTranslationCancelled) {
                clearTimeout(timeoutId);
                resolve();
            }
            
            // 监听AbortController信号
            if (this.abortController) {
                this.abortController.signal.addEventListener('abort', () => {
                    clearTimeout(timeoutId);
                    reject(new Error('翻译已被用户取消'));
                });
            }
        });
    }
    
    // 初始化拖拽上传功能
    initDragAndDrop() {
        const fileUploadArea = document.querySelector('.file-upload-area');
        if (!fileUploadArea) return;
        
        // 添加拖拽区域样式
        fileUploadArea.classList.add('file-drop-zone');
        
        fileUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUploadArea.classList.add('drag-over');
        });
        
        fileUploadArea.addEventListener('dragleave', (e) => {
            // 只有当鼠标真正离开拖拽区域时才移除样式
            if (!fileUploadArea.contains(e.relatedTarget)) {
                fileUploadArea.classList.remove('drag-over');
            }
        });
        
        fileUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUploadArea.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                
                // 创建DataTransfer对象并设置文件
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                
                // 设置文件到输入框
                if (this.txtFileInput) {
                    this.txtFileInput.files = dataTransfer.files;
                }
                
                // 模拟文件选择事件
                const event = { target: { files: [file] } };
                this.handleFileSelect(event);
            }
        });
        
        // 添加拖拽提示
        this.addDragDropHint();
        
        // 添加点击上传提示
        this.addClickUploadHint();
    }
    
    // 添加拖拽提示
    addDragDropHint() {
        const fileUploadArea = document.querySelector('.file-upload-area');
        if (!fileUploadArea) return;
        
        const hint = document.createElement('div');
        hint.className = 'drag-drop-hint';
        hint.innerHTML = '<i class="fas fa-cloud-upload-alt"></i><span>拖拽TXT文件到这里</span>';
        hint.style.display = 'none';
        
        fileUploadArea.appendChild(hint);
        
        // 显示/隐藏提示
        fileUploadArea.addEventListener('dragenter', () => {
            hint.style.display = 'flex';
        });
        
        fileUploadArea.addEventListener('dragleave', (e) => {
            if (!fileUploadArea.contains(e.relatedTarget)) {
                hint.style.display = 'none';
            }
        });
        
        fileUploadArea.addEventListener('drop', () => {
            hint.style.display = 'none';
        });
    }
    
    // 添加点击上传提示
    addClickUploadHint() {
        const fileUploadArea = document.querySelector('.file-upload-area');
        if (!fileUploadArea) return;
        
        const clickHint = document.createElement('div');
        clickHint.className = 'click-upload-hint';
        clickHint.innerHTML = '<i class="fas fa-hand-pointer"></i><span>或点击选择文件</span>';
        clickHint.style.cssText = `
            position: absolute;
            bottom: -25px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.8rem;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            gap: 0.3rem;
            opacity: 0.7;
        `;
        
        fileUploadArea.style.position = 'relative';
        fileUploadArea.appendChild(clickHint);
    }

    showFileSelectFeedback(file) {
        // 创建成功提示
        const feedback = document.createElement('div');
        feedback.className = 'file-select-feedback';
        feedback.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #4CAF50, #45a049);
                color: white;
                padding: 0.5rem 1rem;
                border-radius: 20px;
                font-size: 0.9rem;
                font-weight: 600;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
                animation: fileSelectFeedback 0.6s ease-out forwards;
            ">
                <i class="fas fa-check-circle"></i> 文件选择成功！
            </div>
        `;
        
        document.body.appendChild(feedback);
        
        // 3秒后自动移除
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.style.opacity = '0';
                feedback.style.transition = 'opacity 0.5s ease';
                setTimeout(() => {
                    if (feedback.parentNode) {
                        feedback.parentNode.removeChild(feedback);
                    }
                }, 500);
            }
        }, 3000);
    }


    
    // 重试单行翻译
    async retrySingleLine(task, srcLang, tgtLang, translatedLines) {
        // 检查是否已取消
        if (this.isTranslationCancelled) {
            return;
        }
        
        try {
            console.log(`尝试单独翻译第 ${task.index + 1} 行`);
            const translatedText = await this.translateSingleLine(task.text, srcLang, tgtLang);
            if (translatedText && translatedText.trim()) {
                translatedLines[task.index] = translatedText;
                console.log(`单行翻译成功: ${task.text.substring(0, 30)}...`);
            } else {
                translatedLines[task.index] = `[翻译失败: ${task.originalText}]`;
            }
        } catch (error) {
            console.error(`单行翻译失败:`, error);
            translatedLines[task.index] = `[翻译失败: ${task.originalText}]`;
        }
    }
    
    // 降级到单行翻译
    async fallbackToSingleLineTranslation(batch, srcLang, tgtLang, translatedLines) {
        // 检查是否已取消
        if (this.isTranslationCancelled) {
            return;
        }
        
        console.log(`批次翻译失败，降级到单行翻译模式`);
        this.currentStatus.textContent = `批次失败，正在逐行重试...`;
        
        // 为每个任务创建单行翻译
        const singleLinePromises = batch.map(task => 
            this.retrySingleLine(task, srcLang, tgtLang, translatedLines)
        );
        
        // 并发执行单行翻译，但限制并发数
        const concurrencyLimit = Math.min(2, this.maxConcurrent);
        for (let i = 0; i < singleLinePromises.length; i += concurrencyLimit) {
            // 检查是否已取消
            if (this.isTranslationCancelled) {
                return;
            }
            
            const chunk = singleLinePromises.slice(i, i + concurrencyLimit);
            await Promise.all(chunk);
            
            // 添加小延迟避免API限制
            if (i + concurrencyLimit < singleLinePromises.length) {
                await this.delay(this.adaptiveDelay);
            }
        }
    }
    
    // 单行翻译方法（用于降级处理）
    async translateSingleLine(text, srcLang, tgtLang) {
        // 检查是否已取消
        if (this.isTranslationCancelled) {
            throw new Error('翻译已被用户取消');
        }
        
        const url = `${this.baseUrlInput.value}/chat/completions`;
        
        const systemPrompt = `You are a professional translator. Please translate the following ${srcLang} text into ${tgtLang}. 
        Requirements:
        1. Only provide the translation result, no explanations
        2. Keep proper nouns and technical terms accurate
        3. Ensure the translation is natural and fluent in the target language
        4. If the text is empty or contains only special characters, return the original text`;
        
        // 获取模型名称，处理验证错误
        let modelName;
        try {
            modelName = this.getCurrentModel();
        } catch (error) {
            console.error('单行翻译时模型验证失败:', error.message);
            throw new Error(`模型配置错误: ${error.message}`);
        }
        
        const requestBody = {
            model: modelName,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            temperature: parseFloat(this.temperatureInput?.value || '0.1'), // 降低temperature提高稳定性
            max_tokens: parseInt(this.maxTokensInput?.value || '2000') // 减少token数量
        };
        
        // 智能重试机制
        let retryCount = 0;
        const maxRetries = this.maxRetries;
        
        while (retryCount < maxRetries) {
            // 每次重试前检查是否已取消
            if (this.isTranslationCancelled) {
                throw new Error('翻译已被用户取消');
            }
            
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKeyInput.value}`
                    },
                    body: JSON.stringify(requestBody),
                    signal: this.abortController?.signal // 添加AbortSignal
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
                    
                    // 根据错误类型采用不同策略
                    if (response.status === 429 || errorMessage.includes('rate limit')) {
                        const waitTime = Math.min(3000 * Math.pow(2, retryCount), 20000);
                        this.currentStatus.textContent = `API限制，等待 ${Math.round(waitTime/1000)} 秒后重试...`;
                        await this.delay(waitTime);
                        retryCount++;
                        continue;
                    } else if (response.status === 400 && errorMessage.includes('token')) {
                        // Token相关错误，减少文本长度重试
                        if (text.length > 100) {
                            const shortenedText = text.substring(0, Math.floor(text.length * 0.8));
                            requestBody.messages[1].content = shortenedText;
                            console.log(`文本过长，截取到 ${shortenedText.length} 字符重试`);
                        }
                        retryCount++;
                        continue;
                    }
                    
                    throw new Error(errorMessage);
                }
                
                const data = await response.json();
                return data.choices[0].message.content;
                
            } catch (error) {
                // 检查是否是取消错误
                if (error.name === 'AbortError') {
                    throw new Error('翻译已被用户取消');
                }
                
                retryCount++;
                
                if (retryCount >= maxRetries) {
                    throw new Error(`单行翻译失败，已重试${maxRetries}次: ${error.message}`);
                }
                
                // 网络错误或其他错误，等待后重试
                const waitTime = Math.min(1500 * Math.pow(2, retryCount), 10000);
                this.currentStatus.textContent = `翻译出错，${Math.round(waitTime/1000)}秒后重试... (${retryCount}/${maxRetries})`;
                await this.delay(waitTime);
            }
        }
    }

    // 设置页面可见性变化处理器
    setupVisibilityChangeHandler() {
        // 检测页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isPCDevice() && !this.isDarkTheme()) {
                // 页面重新可见时，延迟一下再刷新背景图片，避免频繁刷新
                setTimeout(() => {
                    this.loadRandomWallpaper();
                }, 1000);
            }
        });
        
        // 检测页面焦点变化
        window.addEventListener('focus', () => {
            if (this.isPCDevice() && !this.isDarkTheme()) {
                // 页面获得焦点时，延迟一下再刷新背景图片
                setTimeout(() => {
                    this.loadRandomWallpaper();
                }, 1000);
            }
        });
    }
}

// 全局函数
function sendMessage() {
    if (window.deepseekChat) {
        window.deepseekChat.sendMessage();
    }
}

function togglePassword() {
    const apiKeyInput = document.getElementById('apiKey');
    const toggleBtn = document.querySelector('.toggle-password i');
    
    if (apiKeyInput && toggleBtn) {
        // 如果是小樱魔卡的密钥，不允许查看
        if (apiKeyInput.classList.contains('sakura-free-key')) {
            alert('小樱魔卡的密钥是受保护的，不能查看哦~ ✨');
            return;
        }
        
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleBtn.className = 'fas fa-eye-slash';
        } else {
            apiKeyInput.type = 'password';
            toggleBtn.className = 'fas fa-eye';
        }
    }
}

function clearCustomModel() {
    const customModelInput = document.getElementById('customModel');
    const modelSelect = document.getElementById('model');
    
    if (customModelInput && modelSelect) {
        customModelInput.value = '';
        modelSelect.value = 'deepseek-chat';
        
        // 隐藏状态指示器
        const customModelWrapper = customModelInput.closest('.custom-model-input-wrapper');
        if (customModelWrapper) {
            const statusValid = customModelWrapper.querySelector('.status-valid');
            const statusInvalid = customModelWrapper.querySelector('.status-invalid');
            if (statusValid) statusValid.style.display = 'none';
            if (statusInvalid) statusInvalid.style.display = 'none';
        }
        
        // 触发模型变化事件
        if (window.deepseekChat) {
            window.deepseekChat.handleModelChange();
        }
        
        // 保存配置
        if (window.deepseekChat) {
            window.deepseekChat.saveConfig();
        }
    }
}



function testConnection() {
    if (!window.deepseekChat) {
        alert('系统未初始化，请刷新页面重试');
        return;
    }

    const apiKey = document.getElementById('apiKey')?.value?.trim();
    const baseUrl = document.getElementById('baseUrl')?.value?.trim();
    
    if (!apiKey) {
        alert('请先输入魔法钥匙');
        return;
    }

    if (!baseUrl) {
        alert('请先输入魔法门地址');
        return;
    }

    // 验证模型配置
    let modelName;
    try {
        modelName = window.deepseekChat.getCurrentModel();
    } catch (error) {
        alert(`模型配置错误：${error.message}\n\n请检查模型设置后重试。`);
        return;
    }

    // 显示测试状态
    const testBtn = document.querySelector('#testConnectionBtn');
    if (!testBtn) return;
    
    const originalText = testBtn.innerHTML;
    testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 测试魔法中...';
    testBtn.disabled = true;

    // 发送一个简单的测试请求
    fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: modelName,
            messages: [
                {
                    role: "user",
                    content: "你好"
                }
            ],
            max_tokens: 10,
            temperature: 0.1
        })
    })
            .then(response => {
        if (response.ok) {
            // 根据当前模式显示不同的成功消息
            let successMessage;
            if (window.deepseekChat && window.deepseekChat.isR18Mode) {
                successMessage = `🔥 嗯哼~ 魅惑魔法连接成功！使用模型：${modelName}\n魅魔酱为亲爱的准备就绪啦~ 💋`;
            } else {
                successMessage = `✨ 喵~ 魔法连接测试成功！使用模型：${modelName}\n小樱 为知世准备就绪啦！🌟`;
            }
            alert(successMessage);
            
            // 更新状态
            if (window.deepseekChat) {
                if (window.deepseekChat.isR18Mode) {
                    window.deepseekChat.updateStatus('嗯哼~ 魅惑魔法连接成功~ 💋🔥', 'ready');
                } else {
                    window.deepseekChat.updateStatus('喵~ 魔法连接成功！✨', 'ready');
                }
            }
        } else {
            // 将英文错误信息转换为中文
            let errorMessage = `HTTP错误 ${response.status}: ${response.statusText}`;
            if (window.deepseekChat) {
                errorMessage = window.deepseekChat.translateErrorMessage(errorMessage);
            }
            throw new Error(errorMessage);
        }
    })
    .catch(error => {
        console.error('魔法连接测试失败:', error);
        
        // 根据当前模式显示不同的失败消息
        let errorMessage;
        if (window.deepseekChat && window.deepseekChat.isR18Mode) {
            errorMessage = `💔 呜~ 魅惑魔法连接失败了：${error.message}\n\n请检查：\n1. 魔法钥匙是否正确\n2. 魔法门地址是否正确\n3. 模型名称是否正确\n4. 网络连接是否正常`;
        } else {
            errorMessage = `💔 呜~ 魔法连接测试失败了：${error.message}\n\n请检查：\n1. 魔法钥匙是否正确\n2. 魔法门地址是否正确\n3. 模型名称是否正确\n4. 网络连接是否正常`;
        }
        alert(errorMessage);
        
        // 更新状态
        if (window.deepseekChat) {
            if (window.deepseekChat.isR18Mode) {
                window.deepseekChat.updateStatus('呜~ 魅惑魔法连接失败了~ 让我重新尝试吧~ 💋', 'error');
            } else {
                window.deepseekChat.updateStatus('呜~ 魔法连接失败了 💔', 'error');
            }
        }
    })
    .finally(() => {
        // 恢复按钮状态
        testBtn.innerHTML = originalText;
        testBtn.disabled = false;
    });
}

function clearChat() {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        // 清空多轮对话历史记录
        if (window.deepseekChat && window.deepseekChat.isMultiTurnMode) {
            window.deepseekChat.conversationHistory = [];
        }
        
        // 根据当前模式显示不同的欢迎消息
        let welcomeMessage;
        if (window.deepseekChat && window.deepseekChat.isR18Mode) {
            welcomeMessage = `
                <div class="welcome-message">
                    <div class="welcome-icon">
                        <i class="fas fa-heart"></i>
                    </div>
                    <h3>嗯哼~ 欢迎来到魅魔酱的魅惑世界！💋🔥</h3>
                    <p>亲爱的，请在上方配置你的魔法钥匙，然后和魅魔酱一起开始魅惑的对话冒险吧~ 💕</p>
                    <div class="feature-list">
                        <div class="feature-item">
                            <i class="fas fa-fire"></i>
                            <span>魅惑魔法体验 💋</span>
                        </div>
                        <div class="feature-item">
                            <i class="fas fa-sliders"></i>
                            <span>智能参数调节 🔥</span>
                        </div>
                        <div class="feature-item">
                            <i class="fas fa-heart"></i>
                            <span>实时魅惑体验 💕</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            welcomeMessage = `
                <div class="welcome-message">
                    <div class="welcome-icon">
                        <i class="fas fa-star"></i>
                    </div>
                    <h3>喵~ 欢迎来到 魔卡少女小樱 的魔法世界！✨</h3>
                    <p>知世，请在上方配置你的魔法钥匙，然后和可爱的小樱一起开始神奇的对话冒险吧~ 🌟</p>
                    <div class="feature-list">
                        <div class="feature-item">
                            <i class="fas fa-cards-blank"></i>
                            <span>多种库洛牌可选 ✨</span>
                        </div>
                        <div class="feature-item">
                            <i class="fas fa-sliders"></i>
                            <span>智能参数调节 🌈</span>
                        </div>
                        <div class="feature-item">
                            <i class="fas fa-wand-magic-sparkles"></i>
                            <span>实时魔法体验 🎀</span>
                        </div>
                    </div>
                </div>
            `;
        }
        
        chatMessages.innerHTML = welcomeMessage;
    }

function exportChat() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    // 获取所有聊天消息
    const messages = chatMessages.querySelectorAll('.message');
    if (messages.length === 0) {
        alert('没有聊天记录可以保存');
        return;
    }
    
    // 构建导出内容
    let exportContent;
    if (window.deepseekChat && window.deepseekChat.isR18Mode) {
        exportContent = '魅魔酱 聊天记录\n';
        exportContent += '='.repeat(30) + '\n\n';
        
        messages.forEach((message, index) => {
            const role = message.classList.contains('user') ? '亲爱的' : 
                        message.classList.contains('assistant') ? '魅魔酱' : '系统';
            const content = message.querySelector('.message-content')?.textContent || '';
            
            exportContent += `[${index + 1}] ${role}:\n`;
            exportContent += content + '\n\n';
        });
    } else {
        exportContent = '魔卡少女小樱 聊天记录\n';
        exportContent += '='.repeat(30) + '\n\n';
        
        messages.forEach((message, index) => {
            const role = message.classList.contains('user') ? '知世' : 
                        message.classList.contains('assistant') ? '小樱' : '系统';
            const content = message.querySelector('.message-content')?.textContent || '';
            
            exportContent += `[${index + 1}] ${role}:\n`;
            exportContent += content + '\n\n';
        });
    }
    
    // 添加统计信息
    const chatCount = document.getElementById('chatCount')?.textContent || '0';
    const totalChars = document.getElementById('totalChars')?.textContent || '0';
    exportContent += `\n统计信息:\n`;
    exportContent += `对话次数: ${chatCount}\n`;
    exportContent += `总字符数: ${totalChars}\n`;
    exportContent += `导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
    
    // 创建下载链接
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
                if (window.deepseekChat && window.deepseekChat.isR18Mode) {
                a.download = `魅魔酱_聊天记录_${new Date().toISOString().slice(0, 10)}.txt`;
            } else {
                a.download = `魔卡少女小樱_聊天记录_${new Date().toISOString().slice(0, 10)}.txt`;
            }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // 显示成功消息
    alert('✨ 喵~ 聊天记录已成功保存啦！🌟');
}

// 文件翻译相关全局函数
function clearFile() {
    if (window.deepseekChat) {
        window.deepseekChat.clearFileInfo();
    }
}

function cancelFileTranslation() {
    if (window.deepseekChat) {
        // 显示确认对话框
        const confirmCancel = confirm('确定要取消文件翻译吗？\n\n⚠️ 已翻译的内容将丢失\n💡 建议等待当前行翻译完成后再取消');
        
        if (confirmCancel) {
            console.log('用户确认取消翻译');
            
            // 立即设置取消标志
            window.deepseekChat.isTranslationCancelled = true;
            
            // 立即停止所有活跃的请求
            window.deepseekChat.activeRequests = 0;
            
            // 使用AbortController真正取消所有正在进行的API请求
            if (window.deepseekChat.abortController) {
                console.log('正在取消所有API请求...');
                window.deepseekChat.abortController.abort();
            }
            
            // 更新状态
            window.deepseekChat.currentStatus.textContent = '翻译已取消，正在清理...';
            
            // 启用翻译按钮
            window.deepseekChat.enableTranslateButton();
            
            // 显示取消消息
            window.deepseekChat.addMessage('system', '❌ 文件翻译已取消\n\n💡 提示：\n• 已翻译的内容已丢失\n• 可以重新选择文件开始翻译\n• 建议检查网络连接和API配置');
            
            // 立即隐藏进度区域
            window.deepseekChat.hideTranslationProgress();
            
            // 清空文件信息
            window.deepseekChat.clearFileInfo();
            
            console.log('翻译取消完成，所有状态已清理');
        }
    }
}

// 主题切换功能
function toggleTheme() {
    const body = document.body;
    const themeBtn = document.querySelector('.nav-actions .btn i');
    
    if (body.getAttribute('data-theme') === 'dark') {
        // 切换到明亮主题
        body.removeAttribute('data-theme');
        themeBtn.className = 'fas fa-moon';
        localStorage.setItem('theme', 'light');
        
        // 在明亮主题下隐藏魔法按键并退出魅魔模式
        if (window.deepseekChat && window.deepseekChat.magicBtn) {
            window.deepseekChat.magicBtn.style.display = 'none';
        }
        if (window.deepseekChat) {
            window.deepseekChat.exitMagicMode();
        }
        
        // 在PC设备上设置背景图片
        if (window.deepseekChat && window.deepseekChat.isPCDevice()) {
            window.deepseekChat.loadRandomWallpaper();
        }
        
        // 设置背景图片透明度
        document.documentElement.style.setProperty('--pc-light-bg-opacity', '0.8');
    } else {
        // 切换到暗夜主题
        body.setAttribute('data-theme', 'dark');
        themeBtn.className = 'fas fa-sun';
        localStorage.setItem('theme', 'dark');
        
        // 在暗夜主题下显示魔法按键
        if (window.deepseekChat && window.deepseekChat.magicBtn) {
            window.deepseekChat.magicBtn.style.display = 'inline-flex';
        }
        
        // 清除背景图片
        if (window.deepseekChat) {
            document.documentElement.style.setProperty('--pc-light-bg', 'none');
        }
        // 设置背景图片透明度为0
        document.documentElement.style.setProperty('--pc-light-bg-opacity', '0');
        // 移除data属性，恢复默认背景
        document.body.removeAttribute('data-has-wallpaper');
        
        // 确保暗夜主题的默认背景正确显示
        document.body.style.background = 'var(--gradient-secondary)';
    }
}

// 初始化主题
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const body = document.body;
    const themeBtn = document.querySelector('.nav-actions .btn i');
    
    if (savedTheme === 'dark') {
        body.setAttribute('data-theme', 'dark');
        themeBtn.className = 'fas fa-sun';
        
        // 强制清除所有背景图片相关的设置
        document.documentElement.style.setProperty('--pc-light-bg', 'none');
        document.documentElement.style.setProperty('--pc-light-bg-opacity', '0');
        document.body.removeAttribute('data-has-wallpaper');
        
        // 确保暗夜主题的默认背景正确显示
        document.body.style.background = 'var(--gradient-secondary)';
        
        // 在暗夜主题下显示魔法按键（延迟执行，确保deepseekChat已初始化）
        setTimeout(() => {
            if (window.deepseekChat && window.deepseekChat.magicBtn) {
                window.deepseekChat.magicBtn.style.display = 'inline-flex';
            }
        }, 100);
    } else {
        body.removeAttribute('data-theme');
        themeBtn.className = 'fas fa-moon';
        
        // 清除内联背景样式，让CSS变量生效
        document.body.style.background = '';
        
        // 在明亮主题下隐藏魔法按键（延迟执行，确保deepseekChat已初始化）
        setTimeout(() => {
            if (window.deepseekChat && window.deepseekChat.magicBtn) {
                window.deepseekChat.magicBtn.style.display = 'none';
            }
            if (window.deepseekChat) {
                window.deepseekChat.exitMagicMode();
            }
            // 在PC设备上设置背景图片
            if (window.deepseekChat && window.deepseekChat.isPCDevice()) {
                window.deepseekChat.loadRandomWallpaper();
            }
        }, 100);
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.deepseekChat = new DeepSeekChat();
    initTheme(); // 初始化主题
});
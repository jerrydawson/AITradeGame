class TradingApp {
    constructor() {
        this.currentModelId = null;
        this.chart = null;
        this.refreshIntervals = {
            market: null,
            portfolio: null,
            trades: null
        };
        this.init();
    }

    init() {
        this.initEventListeners();
        this.loadModels();
        this.loadMarketPrices();
        this.startRefreshCycles();
    }

    initEventListeners() {
        document.getElementById('addModelBtn').addEventListener('click', () => this.showModal());
        document.getElementById('closeModalBtn').addEventListener('click', () => this.hideModal());
        document.getElementById('cancelBtn').addEventListener('click', () => this.hideModal());
        document.getElementById('submitBtn').addEventListener('click', () => this.submitModel());
        document.getElementById('refreshBtn').addEventListener('click', () => this.refresh());

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
    }

    async loadModels() {
        try {
            const response = await fetch('/api/models');
            const models = await response.json();
            this.renderModels(models);

            if (models.length > 0 && !this.currentModelId) {
                this.selectModel(models[0].id);
            }
        } catch (error) {
            console.error('Failed to load models:', error);
        }
    }

    renderModels(models) {
        const container = document.getElementById('modelList');
        
        if (models.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无模型</div>';
            return;
        }

        container.innerHTML = models.map(model => `
            <div class="model-item ${model.id === this.currentModelId ? 'active' : ''}" 
                 onclick="app.selectModel(${model.id})">
                <div class="model-name">${model.name}</div>
                <div class="model-info">
                    <span>${model.model_name}</span>
                    <span class="model-delete" onclick="event.stopPropagation(); app.deleteModel(${model.id})">
                        <i class="bi bi-trash"></i>
                    </span>
                </div>
            </div>
        `).join('');
    }

    async selectModel(modelId) {
        this.currentModelId = modelId;
        this.loadModels();
        await this.loadModelData();
    }

    async loadModelData() {
        if (!this.currentModelId) return;

        try {
            const [portfolio, trades, conversations] = await Promise.all([
                fetch(`/api/models/${this.currentModelId}/portfolio`).then(r => r.json()),
                fetch(`/api/models/${this.currentModelId}/trades?limit=50`).then(r => r.json()),
                fetch(`/api/models/${this.currentModelId}/conversations?limit=20`).then(r => r.json())
            ]);

            this.updateStats(portfolio.portfolio);
            this.updateChart(portfolio.account_value_history, portfolio.portfolio.total_value);
            this.updatePositions(portfolio.portfolio.positions);
            this.updateTrades(trades);
            this.updateConversations(conversations);
        } catch (error) {
            console.error('Failed to load model data:', error);
        }
    }

    updateStats(portfolio) {
        const stats = [
            { value: portfolio.total_value || 0, class: portfolio.total_value > portfolio.initial_capital ? 'positive' : portfolio.total_value < portfolio.initial_capital ? 'negative' : '' },
            { value: portfolio.cash || 0, class: '' },
            { value: portfolio.realized_pnl || 0, class: portfolio.realized_pnl > 0 ? 'positive' : portfolio.realized_pnl < 0 ? 'negative' : '' },
            { value: portfolio.unrealized_pnl || 0, class: portfolio.unrealized_pnl > 0 ? 'positive' : portfolio.unrealized_pnl < 0 ? 'negative' : '' }
        ];

        document.querySelectorAll('.stat-value').forEach((el, index) => {
            if (stats[index]) {
                el.textContent = `$${Math.abs(stats[index].value).toFixed(2)}`;
                el.className = `stat-value ${stats[index].class}`;
            }
        });
    }

    updateChart(history, currentValue) {
        const chartDom = document.getElementById('accountChart');
        
        if (!this.chart) {
            this.chart = echarts.init(chartDom);
            window.addEventListener('resize', () => {
                if (this.chart) {
                    this.chart.resize();
                }
            });
        }

        const data = history.reverse().map(h => ({
            time: new Date(h.timestamp.replace(' ', 'T') + 'Z').toLocaleTimeString('zh-CN', { 
                timeZone: 'Asia/Shanghai',
                hour: '2-digit', 
                minute: '2-digit' 
            }),
            value: h.total_value
        }));

        if (currentValue !== undefined && currentValue !== null) {
            const now = new Date();
            const currentTime = now.toLocaleTimeString('zh-CN', { 
                timeZone: 'Asia/Shanghai',
                hour: '2-digit', 
                minute: '2-digit' 
            });
            data.push({
                time: currentTime,
                value: currentValue
            });
        }

        const option = {
            grid: {
                left: '60',
                right: '20',
                bottom: '30',
                top: '20',
                containLabel: false
            },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: data.map(d => d.time),
                axisLine: { lineStyle: { color: '#e5e6eb' } },
                axisLabel: { color: '#86909c', fontSize: 11 }
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLine: { lineStyle: { color: '#e5e6eb' } },
                axisLabel: { 
                    color: '#86909c', 
                    fontSize: 11,
                    formatter: (value) => `$${value.toLocaleString()}`
                },
                splitLine: { lineStyle: { color: '#f2f3f5' } }
            },
            series: [{
                type: 'line',
                data: data.map(d => d.value),
                smooth: true,
                symbol: 'none',
                lineStyle: { color: '#3370ff', width: 2 },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(51, 112, 255, 0.2)' },
                            { offset: 1, color: 'rgba(51, 112, 255, 0)' }
                        ]
                    }
                }
            }],
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: '#e5e6eb',
                borderWidth: 1,
                textStyle: { color: '#1d2129' },
                formatter: (params) => {
                    const value = params[0].value;
                    return `${params[0].axisValue}<br/>$${value.toFixed(2)}`;
                }
            }
        };

        this.chart.setOption(option);
        
        setTimeout(() => {
            if (this.chart) {
                this.chart.resize();
            }
        }, 100);
    }

    updatePositions(positions) {
        const tbody = document.getElementById('positionsBody');
        
        if (positions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无持仓</td></tr>';
            return;
        }

        tbody.innerHTML = positions.map(pos => {
            const sideClass = pos.side === 'long' ? 'badge-long' : 'badge-short';
            const sideText = pos.side === 'long' ? '做多' : '做空';
            
            const currentPrice = pos.current_price !== null && pos.current_price !== undefined 
                ? `$${pos.current_price.toFixed(2)}` 
                : '-';
            
            let pnlDisplay = '-';
            let pnlClass = '';
            if (pos.pnl !== undefined && pos.pnl !== 0) {
                pnlClass = pos.pnl > 0 ? 'text-success' : 'text-danger';
                pnlDisplay = `${pos.pnl > 0 ? '+' : ''}$${pos.pnl.toFixed(2)}`;
            }
            
            return `
                <tr>
                    <td><strong>${pos.coin}</strong></td>
                    <td><span class="badge ${sideClass}">${sideText}</span></td>
                    <td>${pos.quantity.toFixed(4)}</td>
                    <td>$${pos.avg_price.toFixed(2)}</td>
                    <td>${currentPrice}</td>
                    <td>${pos.leverage}x</td>
                    <td class="${pnlClass}"><strong>${pnlDisplay}</strong></td>
                </tr>
            `;
        }).join('');
    }

    updateTrades(trades) {
        const tbody = document.getElementById('tradesBody');
        
        if (trades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无交易记录</td></tr>';
            return;
        }

        tbody.innerHTML = trades.map(trade => {
            const signalMap = {
                'buy_to_enter': { badge: 'badge-buy', text: '开多' },
                'sell_to_enter': { badge: 'badge-sell', text: '开空' },
                'close_position': { badge: 'badge-close', text: '平仓' }
            };
            const signal = signalMap[trade.signal] || { badge: '', text: trade.signal };
            const pnlClass = trade.pnl > 0 ? 'text-success' : trade.pnl < 0 ? 'text-danger' : '';

            return `
                <tr>
                    <td>${new Date(trade.timestamp.replace(' ', 'T') + 'Z').toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</td>
                    <td><strong>${trade.coin}</strong></td>
                    <td><span class="badge ${signal.badge}">${signal.text}</span></td>
                    <td>${trade.quantity.toFixed(4)}</td>
                    <td>$${trade.price.toFixed(2)}</td>
                    <td class="${pnlClass}">$${trade.pnl.toFixed(2)}</td>
                </tr>
            `;
        }).join('');
    }

    updateConversations(conversations) {
        const container = document.getElementById('conversationsBody');
        
        if (conversations.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无对话记录</div>';
            return;
        }

        container.innerHTML = conversations.map(conv => `
            <div class="conversation-item">
                <div class="conversation-time">${new Date(conv.timestamp.replace(' ', 'T') + 'Z').toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</div>
                <div class="conversation-content">${conv.ai_response}</div>
            </div>
        `).join('');
    }

    async loadMarketPrices() {
        try {
            const response = await fetch('/api/market/prices');
            const prices = await response.json();
            this.renderMarketPrices(prices);
        } catch (error) {
            console.error('Failed to load market prices:', error);
        }
    }

    renderMarketPrices(prices) {
        const container = document.getElementById('marketPrices');
        
        container.innerHTML = Object.entries(prices).map(([coin, data]) => {
            const changeClass = data.change_24h >= 0 ? 'positive' : 'negative';
            const changeIcon = data.change_24h >= 0 ? '▲' : '▼';
            
            return `
                <div class="price-item">
                    <div>
                        <div class="price-symbol">${coin}</div>
                        <div class="price-change ${changeClass}">${changeIcon} ${Math.abs(data.change_24h).toFixed(2)}%</div>
                    </div>
                    <div class="price-value">$${data.price.toFixed(2)}</div>
                </div>
            `;
        }).join('');
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}Tab`).classList.add('active');
    }

    showModal() {
        document.getElementById('addModelModal').classList.add('show');
    }

    hideModal() {
        document.getElementById('addModelModal').classList.remove('show');
    }

    async submitModel() {
        const data = {
            name: document.getElementById('modelName').value,
            api_key: document.getElementById('apiKey').value,
            api_url: document.getElementById('apiUrl').value,
            model_name: document.getElementById('modelIdentifier').value,
            initial_capital: parseFloat(document.getElementById('initialCapital').value)
        };

        if (!data.name || !data.api_url || !data.model_name) {
            alert('请填写所有必填字段');
            return;
        }

        try {
            const response = await fetch('/api/models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                this.hideModal();
                this.loadModels();
                this.clearForm();
            }
        } catch (error) {
            console.error('Failed to add model:', error);
            alert('添加模型失败');
        }
    }

    async deleteModel(modelId) {
        if (!confirm('确定要删除这个模型吗？')) return;

        try {
            const response = await fetch(`/api/models/${modelId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                if (this.currentModelId === modelId) {
                    this.currentModelId = null;
                }
                this.loadModels();
            }
        } catch (error) {
            console.error('Failed to delete model:', error);
        }
    }

    clearForm() {
        document.getElementById('modelName').value = '';
        document.getElementById('apiKey').value = '';
        document.getElementById('apiUrl').value = '';
        document.getElementById('modelIdentifier').value = '';
        document.getElementById('initialCapital').value = '100000';
    }

    async refresh() {
        await Promise.all([
            this.loadModels(),
            this.loadMarketPrices(),
            this.loadModelData()
        ]);
    }

    startRefreshCycles() {
        this.refreshIntervals.market = setInterval(() => {
            this.loadMarketPrices();
        }, 5000);

        this.refreshIntervals.portfolio = setInterval(() => {
            if (this.currentModelId) {
                this.loadModelData();
            }
        }, 10000);
    }

    stopRefreshCycles() {
        Object.values(this.refreshIntervals).forEach(interval => {
            if (interval) clearInterval(interval);
        });
    }
}

const app = new TradingApp();

(() => {
    const apiBase = window.REVENDAS_API_URL || 'http://localhost:3000';
    const tokenKey = 'revendas.session';

    async function request(path, options = {}) {
        const token = localStorage.getItem(tokenKey);
        const response = await fetch(`${apiBase}${path}`, {
            ...options,
            headers: {
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...options.headers,
            },
        });
        const payload = response.status === 204 ? {} : await response.json();
        if (!response.ok) {
            const error = new Error(payload.error || 'Não foi possível concluir a operação.');
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    async function ensureSession() {
        const token = localStorage.getItem(tokenKey);
        if (token) {
            try {
                return (await request('/api/me')).user;
            } catch (error) {
                if (error.status !== 401) throw error;
                localStorage.removeItem(tokenKey);
            }
        }
        const session = await request('/api/session', { method: 'POST' });
        localStorage.setItem(tokenKey, session.token);
        return session.user;
    }

    async function login(email, password) {
        const session = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        localStorage.setItem(tokenKey, session.token);
        return session.user;
    }

    async function register(name, email, password) {
        const result = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
        return result.user;
    }

    window.ReVendasApi = {
        request,
        ensureSession,
        login,
        register,
        money: (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100),
        escape: (value) => String(value).replace(/[&<>"']/g, (character) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[character]),
    };
})();

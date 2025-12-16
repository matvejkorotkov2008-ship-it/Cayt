// Telegram API интеграция
class TelegramChannelLoader {
    constructor() {
        this.channelUsername = 'BMJAN';
        this.updateInterval = 5 * 60 * 1000; // 5 минут
        this.posts = [];
        this.photos = [];
        this.cache = null;
        this.cacheTime = 0;
        this.cacheDuration = 3 * 60 * 1000; // Кеш на 3 минуты для ускорения
        this.maxPosts = 10; // Максимум 10 постов
    }

    // Получение постов через Telegram Bot API (оптимизированная версия)
    async fetchPostsFromTelegram() {
        const startTime = Date.now();
        
        // Проверяем кеш
        if (this.cache && (Date.now() - this.cacheTime) < this.cacheDuration) {
            console.log('Используем кеш, загрузка мгновенная');
            // Возвращаем только последние 10 постов из кеша
            const cachedPosts = this.cache.posts || [];
            return {
                posts: cachedPosts.slice(0, this.maxPosts),
                photos: this.cache.photos || []
            };
        }
        
        try {
            // Метод 1: Прямой парсинг через Telegram Web (самый быстрый)
            try {
                const webUrl = `https://t.me/s/${this.channelUsername}`;
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(webUrl)}`;
                
                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    let html = data.contents || data;
                    if (typeof html === 'string' && html.length > 100) {
                        const result = this.parseTelegramWeb(html);
                        if (result.posts && result.posts.length > 0) {
                            // Убираем дубликаты по ссылкам
                            const uniquePosts = [];
                            const seenLinks = new Set();
                            result.posts.forEach(post => {
                                if (post && post.link && !seenLinks.has(post.link)) {
                                    seenLinks.add(post.link);
                                    uniquePosts.push(post);
                                }
                            });
                            
                            // Сортируем по дате и берем последние 10
                            const sortedPosts = uniquePosts.sort((a, b) => {
                                const dateA = new Date(a.date || 0);
                                const dateB = new Date(b.date || 0);
                                return dateB - dateA;
                            }).slice(0, this.maxPosts);
                            
                            this.cache = { posts: sortedPosts, photos: [] };
                            this.cacheTime = Date.now();
                            console.log(`Загружено ${sortedPosts.length} постов за ${Date.now() - startTime}ms`);
                            console.log('Примеры постов:', sortedPosts.slice(0, 3).map(p => ({ title: p.title, link: p.link })));
                            return this.cache;
                        } else {
                            console.warn('HTML получен, но посты не найдены. Проверьте структуру страницы.');
                        }
                    }
                } else {
                    console.warn(`Ошибка загрузки: ${response.status}`);
                }
            } catch (e) {
                console.log('Telegram Web недоступен, пробуем RSS:', e.message);
            }
            
            // Метод 2: RSS фид (резервный)
            const rssUrl = `https://tg.i-c-a.su/rss/${this.channelUsername}`;
            try {
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`;
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    const data = await response.json();
                    const text = data.contents || data;
                    if (text && (text.includes('<rss') || text.includes('<feed'))) {
                        const result = this.parseRSSFeed(text);
                        if (result.posts.length > 0) {
                            // Сортируем и берем последние 10
                            const sortedPosts = result.posts.sort((a, b) => {
                                const dateA = new Date(a.date || 0);
                                const dateB = new Date(b.date || 0);
                                return dateB - dateA;
                            }).slice(0, this.maxPosts);
                            
                            this.cache = { posts: sortedPosts, photos: result.photos || [] };
                            this.cacheTime = Date.now();
                            console.log(`Данные загружены через RSS за ${Date.now() - startTime}ms`);
                            return this.cache;
                        }
                    }
                }
            } catch (e) {
                console.log('RSS недоступен');
            }


            // Fallback - возвращаем пустые данные
            console.warn('Все методы загрузки недоступны. Проверьте доступность канала.');
            return this.getMockData();
            
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            return this.getMockData();
        }
    }

    // Парсинг Telegram Web страницы
    parseTelegramWeb(html) {
        const posts = [];
        const photos = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Получение аватарки канала - пробуем разные селекторы
        let avatarUrl = null;
        
        // Вариант 1: Стандартные селекторы Telegram
        const avatarSelectors = [
            '.tgme_channel_info_header_photo img',
            '.tgme_page_photo img',
            '.tgme_channel_info_header img',
            '.tgme_channel_info_header_photo',
            'img.tgme_channel_info_header_photo',
            '.tgme_channel_info_header_photo_wrap img',
            'img[src*="avatar"]',
            '.tgme_page_photo_wrap img'
        ];
        
        for (const selector of avatarSelectors) {
            const avatarImg = doc.querySelector(selector);
            if (avatarImg) {
                avatarUrl = avatarImg.src || avatarImg.getAttribute('src') || avatarImg.getAttribute('data-src');
                if (avatarUrl && avatarUrl.includes('avatar')) {
                    break;
                }
            }
        }
        
        // Вариант 2: Поиск в мета-тегах
        if (!avatarUrl) {
            const metaImage = doc.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
            if (metaImage) {
                avatarUrl = metaImage.getAttribute('content');
            }
        }
        
        // Вариант 3: Прямая ссылка на аватарку канала через Telegram API
        if (!avatarUrl) {
            // Пробуем найти любую картинку в header
            const headerImg = doc.querySelector('.tgme_channel_info_header img, .tgme_page_photo img');
            if (headerImg) {
                avatarUrl = headerImg.src || headerImg.getAttribute('src');
            }
        }
        
        // Устанавливаем аватарку
        if (avatarUrl) {
            console.log('Найдена аватарка:', avatarUrl);
            this.setChannelAvatar(avatarUrl);
        } else {
            console.warn('Аватарка не найдена, используем резервный метод');
            // Пробуем загрузить аватарку отдельно
            setTimeout(() => this.loadChannelAvatar(), 500);
        }
        
        // Поиск постов в структуре Telegram Web (берем только первые элементы для скорости)
        let messageElements = doc.querySelectorAll('.tgme_widget_message');
        
        // Если не нашли стандартные элементы, пробуем альтернативные селекторы
        if (messageElements.length === 0) {
            messageElements = doc.querySelectorAll('[data-post], .message, .tgme_widget_message_wrap');
        }
        
        // Ограничиваем количество элементов для парсинга (только первые 15 для скорости)
        if (messageElements.length > 15) {
            messageElements = Array.from(messageElements).slice(0, 15);
        }
        
        console.log(`Найдено ${messageElements.length} элементов сообщений для парсинга`);
        
        if (messageElements.length === 0) {
            console.warn('Посты не найдены в HTML структуре. Проверьте селекторы.');
            return { posts, photos };
        }
        
        messageElements.forEach((element, index) => {
            // Поиск текста поста
            const textElement = element.querySelector('.tgme_widget_message_text, .message_text, p');
            const text = textElement ? textElement.textContent.trim() : '';
            
            // Поиск ссылки на пост - пробуем разные варианты
            let postLink = null;
            
            // Вариант 1: Стандартная ссылка на дату
            const dateLink = element.querySelector('a.tgme_widget_message_date, a.message_date');
            if (dateLink && dateLink.href) {
                postLink = dateLink.href;
            }
            
            // Вариант 2: Любая ссылка с ID поста
            if (!postLink) {
                const allLinks = element.querySelectorAll('a[href*="/"]');
                for (const link of allLinks) {
                    const href = link.href;
                    // Ищем ссылки вида t.me/channel/123
                    if (href.includes(`/${this.channelUsername}/`) || href.match(/\/\d+$/)) {
                        postLink = href;
                        break;
                    }
                }
            }
            
            // Вариант 3: Из data-post атрибута
            if (!postLink) {
                const dataPost = element.getAttribute('data-post') || element.closest('[data-post]')?.getAttribute('data-post');
                if (dataPost) {
                    postLink = `https://t.me/${dataPost}`;
                }
            }
            
            // Вариант 4: Из родительского элемента
            if (!postLink) {
                const parentLink = element.closest('a[href*="/"]');
                if (parentLink && parentLink.href) {
                    postLink = parentLink.href;
                }
            }
            
            // Если нет ссылки, пропускаем этот пост
            if (!postLink) {
                return;
            }
            
            // Поиск изображений (исключаем аватары)
            const imgElements = element.querySelectorAll('.tgme_widget_message_photo img, img.tgme_widget_message_photo');
            const imageUrls = [];
            imgElements.forEach(img => {
                let imgUrl = img.src || img.getAttribute('src') || img.getAttribute('data-src');
                if (imgUrl) {
                    const imgUrlLower = imgUrl.toLowerCase();
                    // Исключаем аватары, placeholder, loading и другие служебные изображения
                    if (!imgUrlLower.includes('placeholder') && 
                        !imgUrlLower.includes('loading') && 
                        !imgUrlLower.includes('avatar') &&
                        !imgUrlLower.includes('channel') &&
                        !imgUrlLower.includes('profile') &&
                        !imgUrlLower.includes('logo') &&
                        !imgUrlLower.includes('icon')) {
                        // Убираем параметры размера для получения полного изображения
                        imgUrl = imgUrl.split('?')[0];
                        imageUrls.push(imgUrl);
                    }
                }
            });
            
            // Поиск видео
            const videoElement = element.querySelector('.tgme_widget_message_video, video, .tgme_widget_message_video_player');
            const hasVideo = !!videoElement;
            
            // Проверяем наличие видео по классам
            const hasVideoClass = element.classList.contains('tgme_widget_message_video') || 
                                 element.querySelector('.tgme_widget_message_video') !== null;
            
            const hasImage = imageUrls.length > 0;
            
            // Создаем пост только если есть контент (текст, изображение или видео) и ссылка
            if (postLink && (text || hasImage || hasVideo || hasVideoClass)) {
                // Извлекаем ID поста из ссылки для правильной классификации
                const postIdMatch = postLink.match(/\/(\d+)$/);
                const postId = postIdMatch ? postIdMatch[1] : null;
                
                const postData = {
                    id: postId || index,
                    title: text.substring(0, 50) || (hasImage ? 'Фото' : hasVideo ? 'Видео' : `Пост ${index + 1}`),
                    text: text || (hasImage ? 'Фото из канала' : hasVideo ? 'Видео из канала' : ''),
                    link: postLink,
                    date: new Date().toISOString(),
                    image: imageUrls[0] || null,
                    hasImage: hasImage,
                    video: hasVideo || hasVideoClass,
                    mediaType: (hasVideo || hasVideoClass) ? 'video' : (hasImage ? 'photo' : 'text')
                };
                
                posts.push(postData);
                console.log(`Добавлен пост ${index + 1}:`, postData.title, postData.link);
            } else if (!postLink) {
                console.warn(`Пропущен пост ${index + 1}: нет ссылки`);
            }
        });
        
        console.log(`Всего распарсено ${posts.length} постов`);
        return { posts, photos };
    }

    // Парсинг RSS фида
    parseRSSFeed(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const items = xmlDoc.querySelectorAll('item');
        
        const posts = [];
        const photos = [];
        
        items.forEach((item, index) => {
            const title = item.querySelector('title')?.textContent || `Пост ${index + 1}`;
            const description = item.querySelector('description')?.textContent || '';
            const link = item.querySelector('link')?.textContent || `https://t.me/${this.channelUsername}`;
            const pubDate = item.querySelector('pubDate')?.textContent || '';
            
            // Извлечение всех изображений из описания
            const imgMatches = description.matchAll(/<img[^>]+src="([^"]+)"/g);
            const imageUrls = Array.from(imgMatches, m => m[1]);
            
            // Также ищем изображения в других форматах
            const cdataMatch = description.match(/<!\[CDATA\[(.*?)\]\]>/s);
            if (cdataMatch) {
                const cdataContent = cdataMatch[1];
                const cdataImgs = cdataContent.matchAll(/<img[^>]+src="([^"]+)"/g);
                imageUrls.push(...Array.from(cdataImgs, m => m[1]));
            }
            
            // Поиск прямых ссылок на изображения
            const directImgMatch = description.match(/https?:\/\/[^\s<>"]+\.(jpg|jpeg|png|gif|webp)/gi);
            if (directImgMatch) {
                imageUrls.push(...directImgMatch);
            }
            
            // Добавляем уникальные фотографии
            const uniqueUrls = [...new Set(imageUrls)];
            uniqueUrls.forEach(imgUrl => {
                if (imgUrl && !imgUrl.includes('placeholder') && !imgUrl.includes('loading')) {
                    photos.push({
                        url: imgUrl,
                        title: this.stripHTML(title),
                        link: link
                    });
                }
            });
            
            const hasImage = uniqueUrls.length > 0;
            posts.push({
                id: index,
                title: this.stripHTML(title),
                text: this.stripHTML(description).substring(0, 100) + (description.length > 100 ? '...' : ''),
                link: link,
                date: pubDate,
                image: uniqueUrls[0] || null,
                hasImage: hasImage
            });
        });
        
        return { posts, photos };
    }

    // Парсинг данных из JSON API
    parseTelegramData(data) {
        const posts = [];
        const photos = [];
        
        if (data.messages && Array.isArray(data.messages)) {
            data.messages.forEach((message, index) => {
                const text = message.message || message.text || '';
                const images = message.media || [];
                
                if (images.length > 0) {
                    images.forEach(img => {
                        photos.push({
                            url: img.url || img.photo || img.file,
                            title: text.substring(0, 50) || `Фото ${photos.length + 1}`,
                            link: `https://t.me/${this.channelUsername}/${message.id || index}`
                        });
                    });
                }
                
                const hasImage = images.length > 0;
                posts.push({
                    id: message.id || index,
                    title: text.substring(0, 30) || `Пост ${index + 1}`,
                    text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                    link: `https://t.me/${this.channelUsername}/${message.id || index}`,
                    date: message.date || new Date().toISOString(),
                    image: images[0]?.url || images[0]?.photo || null,
                    hasImage: hasImage,
                    video: message.video || null,
                    mediaType: message.media_type || (hasImage ? 'photo' : 'text')
                });
            });
        }
        
        return { posts, photos };
    }

    // Пустые данные если API недоступен
    getMockData() {
        return {
            posts: [],
            photos: []
        };
    }

    // Удаление HTML тегов
    stripHTML(html) {
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    // Загрузка и отображение всех постов
    async loadPosts() {
        const loadingElement = document.getElementById('loading-posts');
        const container = document.getElementById('posts-container');
        
        try {
            loadingElement.style.display = 'block';
            container.innerHTML = '';
            
            const data = await this.fetchPostsFromTelegram();
            let posts = data.posts || [];
            
            // Убираем аватарки канала из постов
            posts = posts.filter(post => {
                if (post.image) {
                    // Исключаем аватары канала
                    const imgUrl = post.image.toLowerCase();
                    return !imgUrl.includes('avatar') && 
                           !imgUrl.includes('channel') && 
                           !imgUrl.includes('profile') &&
                           !imgUrl.includes('logo');
                }
                return true;
            });
            
            // Сортируем посты по дате (новые сначала) и берем последние 10
            posts = posts.sort((a, b) => {
                const dateA = new Date(a.date || 0);
                const dateB = new Date(b.date || 0);
                return dateB - dateA;
            }).slice(0, this.maxPosts);
            
            this.posts = posts;
            
            // Отображаем последние 10 постов
            if (this.posts.length > 0) {
                console.log(`Отображаем ${this.posts.length} постов`);
                this.posts.forEach((post, index) => {
                    const postElement = this.createPostElement(post, index);
                    container.appendChild(postElement);
                });
                
                // Перезагружаем Telegram Widget скрипты для виджетов
                this.loadTelegramWidgets();
            } else {
                console.warn('Посты не найдены. Проверьте загрузку данных.');
                container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 2rem;">Загрузка контента... Если посты не появились, проверьте консоль браузера (F12).</p>';
            }
            
            loadingElement.style.display = 'none';
            this.updateLastUpdateTime();
            
        } catch (error) {
            console.error('Ошибка загрузки контента:', error);
            loadingElement.style.display = 'none';
        }
    }

    // Определение типа поста по содержимому
    determinePostType(post) {
        // Приоритет 1: Видео
        if (post.video === true || post.mediaType === 'video') {
            return 'video';
        }
        
        // Проверяем текст на упоминание видео
        const text = (post.text || post.title || '').toLowerCase();
        if (text.includes('видео') || text.includes('video')) {
            // Но только если нет изображения (чтобы не путать с фото-постами)
            if (!post.image) {
                return 'video';
            }
        }
        
        // Приоритет 2: Фото
        if (post.image) {
            const imgUrl = post.image.toLowerCase();
            // Исключаем аватары и служебные изображения
            if (!imgUrl.includes('avatar') && 
                !imgUrl.includes('channel') &&
                !imgUrl.includes('profile') &&
                !imgUrl.includes('logo') &&
                !imgUrl.includes('icon')) {
                return 'photo';
            }
        }
        
        // Проверяем медиа тип
        if (post.mediaType === 'photo' || post.hasImage === true) {
            if (post.image && !post.image.toLowerCase().includes('avatar')) {
                return 'photo';
            }
        }
        
        // Приоритет 3: Текстовый пост (кружок/виджет)
        // Все остальные посты считаются текстовыми (кружками)
        return 'text';
    }
    
    // Извлечение ID поста из ссылки
    extractPostId(link) {
        const match = link.match(/\/(\d+)$/);
        return match ? match[1] : null;
    }

    // Создание элемента поста
    createPostElement(post, index) {
        const postType = post.type || 'text';
        let icon;
        
        switch(postType) {
            case 'photo':
                icon = '📷';
                break;
            case 'video':
                icon = '🎥';
                break;
            default:
                icon = '💬';
        }
        
        const postDiv = document.createElement('div');
        postDiv.className = `post-circle post-${postType}`;
        postDiv.setAttribute('data-type', postType);
        
        // Извлекаем ID поста для виджета
        const postId = this.extractPostId(post.link);
        
        // Для всех постов используем упрощенное отображение с переходом в новую вкладку
        let imagePreview = '';
        if (post.image && !post.image.includes('avatar') && !post.image.includes('channel')) {
            imagePreview = `<img src="${post.image}" alt="${this.escapeHtml(post.title)}" class="post-preview-image" onerror="this.style.display='none'">`;
        }
        
        // Создаем кликабельный элемент, который открывает пост в новой вкладке
        postDiv.style.cursor = 'pointer';
        postDiv.onclick = function() {
            window.open(post.link, '_blank');
        };
        
        postDiv.innerHTML = `
            <div class="post-circle-content">
                ${imagePreview}
                <div class="post-icon">${icon}</div>
                <h3>${this.escapeHtml(post.title)}</h3>
                <p>${this.escapeHtml(post.text)}</p>
                <div class="post-link">Открыть в Telegram →</div>
            </div>
        `;
        
        return postDiv;
    }


    // Создание элемента фотографии
    createPhotoElement(photo) {
        const photoDiv = document.createElement('div');
        photoDiv.className = 'photo-item';
        
        let imageUrl = photo.url;
        
        // Убеждаемся, что URL полный
        if (imageUrl && !imageUrl.startsWith('http')) {
            if (imageUrl.startsWith('//')) {
                imageUrl = 'https:' + imageUrl;
            } else if (imageUrl.startsWith('/')) {
                imageUrl = 'https://t.me' + imageUrl;
            }
        }
        
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = this.escapeHtml(photo.title);
        img.loading = 'lazy';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        
        // Обработка ошибок загрузки
        img.onerror = function() {
            // Пробуем альтернативные методы загрузки
            const altUrl = imageUrl.includes('cdn') ? imageUrl.replace('cdn', 'cdn4') : imageUrl;
            if (this.src !== altUrl) {
                this.src = altUrl;
            } else {
                // Если не удалось загрузить, показываем placeholder
                const placeholder = document.createElement('div');
                placeholder.className = 'photo-placeholder';
                placeholder.innerHTML = '<span>Фото недоступно</span>';
                photoDiv.innerHTML = '';
                photoDiv.appendChild(placeholder);
            }
        };
        
        const overlay = document.createElement('div');
        overlay.className = 'photo-overlay';
        overlay.innerHTML = `<a href="${photo.link}" target="_blank" class="photo-btn">Посмотреть</a>`;
        
        photoDiv.appendChild(img);
        photoDiv.appendChild(overlay);
        
        return photoDiv;
    }

    // Экранирование HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Установка аватарки канала
    setChannelAvatar(avatarUrl) {
        const avatarElement = document.getElementById('channel-avatar');
        if (avatarElement && avatarUrl) {
            // Убираем проверку на 'avatar' в URL, так как она может быть в другом формате
            avatarElement.src = avatarUrl;
            avatarElement.style.display = 'block';
            
            const loader = this;
            avatarElement.onload = function() {
                console.log('Аватарка успешно загружена');
                // Скрываем резервное изображение при успешной загрузке
                const fallback = this.nextElementSibling;
                if (fallback) {
                    fallback.style.display = 'none';
                }
            };
            avatarElement.onerror = function() {
                console.warn('Ошибка загрузки аватарки, пробуем альтернативный метод');
                // Показываем резервное изображение
                const fallback = this.nextElementSibling;
                if (fallback) {
                    fallback.style.display = 'flex';
                }
                // Пробуем загрузить через альтернативный метод
                loader.loadChannelAvatar();
            };
        }
    }
    
    // Загрузка аватарки отдельно (приоритетный метод)
    async loadChannelAvatar() {
        try {
            console.log('Начинаем загрузку аватарки канала...');
            // Пробуем загрузить аватарку напрямую
            const webUrl = `https://t.me/${this.channelUsername}`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(webUrl)}`;
            
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const data = await response.json();
                const html = data.contents || data;
                if (typeof html === 'string') {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    
                    // Ищем аватарку разными способами
                    const avatarSelectors = [
                        '.tgme_channel_info_header_photo img',
                        '.tgme_page_photo img',
                        'meta[property="og:image"]',
                        'meta[name="twitter:image"]',
                        '.tgme_channel_info_header img',
                        'img[src*="avatar"]'
                    ];
                    
                    for (const selector of avatarSelectors) {
                        const element = doc.querySelector(selector);
                        if (element) {
                            let url = element.src || element.getAttribute('content') || element.getAttribute('src') || element.getAttribute('data-src');
                            if (url && url.trim()) {
                                console.log('Аватарка найдена через селектор:', selector, url);
                                this.setChannelAvatar(url);
                                return;
                            }
                        }
                    }
                    
                    console.warn('Аватарка не найдена в HTML, пробуем альтернативные методы');
                }
            } else {
                console.warn('Ошибка загрузки страницы канала:', response.status);
            }
        } catch (e) {
            console.log('Не удалось загрузить аватарку:', e);
        }
    }
    
    // Загрузка Telegram Widget скриптов
    loadTelegramWidgets() {
        // Удаляем старые скрипты виджетов
        const oldScripts = document.querySelectorAll('script[src*="telegram-widget"]');
        oldScripts.forEach(script => script.remove());
        
        // Находим все контейнеры с виджетами
        const widgetContainers = document.querySelectorAll('.telegram-widget-container script');
        widgetContainers.forEach(scriptTag => {
            if (scriptTag.src && scriptTag.src.includes('telegram-widget')) {
                // Создаем новый скрипт
                const newScript = document.createElement('script');
                newScript.async = true;
                newScript.src = scriptTag.src;
                Object.keys(scriptTag.dataset).forEach(key => {
                    newScript.setAttribute(`data-${key}`, scriptTag.dataset[key]);
                });
                scriptTag.parentNode.replaceChild(newScript, scriptTag);
            }
        });
    }

    // Обновление времени последнего обновления
    updateLastUpdateTime() {
        const updateElement = document.getElementById('last-update');
        if (updateElement) {
            const now = new Date();
            const timeString = now.toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            updateElement.textContent = `Последнее обновление: ${timeString}`;
        }
    }

    // Автоматическое обновление
    startAutoUpdate() {
        // Загружаем аватарку сразу при старте
        console.log('Загрузка аватарки канала...');
        this.loadChannelAvatar();
        
        // Повторная попытка загрузки аватарки через 1 секунду для надежности
        setTimeout(() => {
            if (!document.getElementById('channel-avatar')?.src || 
                document.getElementById('channel-avatar')?.style.display === 'none') {
                console.log('Повторная попытка загрузки аватарки...');
                this.loadChannelAvatar();
            }
        }, 1000);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Smooth scroll для навигации
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Анимации отключены - элементы всегда видны

    // Эффект для header при скролле
    let lastScroll = 0;
    const header = document.querySelector('.header');

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100) {
            header.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        } else {
            header.style.boxShadow = '0 2px 4px -1px rgba(0, 0, 0, 0.06)';
        }
        
        lastScroll = currentScroll;
    });

    // Эффект для кружков персонажей
    const characterCircles = document.querySelectorAll('.character-circle');
    characterCircles.forEach((circle) => {
        circle.addEventListener('mouseenter', () => {
            circle.style.transform = 'scale(1.2)';
        });
        circle.addEventListener('mouseleave', () => {
            circle.style.transform = 'scale(1)';
        });
    });

    // Инициализация загрузчика Telegram
    const loader = new TelegramChannelLoader();
    loader.startAutoUpdate();
});

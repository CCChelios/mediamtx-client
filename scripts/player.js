// Player / MSE logic extracted from index.html

// Воспроизведение записи
function playRecording(pathName, segmentStart, duration) {
	const playbackUrl = document.getElementById('playbackUrl').value.trim();

	if (!playbackUrl) {
		alert('Пожалуйста, введите URL Playback сервера');
		return;
	}

	// URL для воспроизведения записи - используем format=fmp4 для MSE подгрузки сегментов
	// Берём чуть больше длительность для уверенности в полной записи
	const safeDuration = Math.ceil(duration) + 10;
	const recordingUrl = `${playbackUrl}/get?path=${encodeURIComponent(pathName)}&start=${encodeURIComponent(segmentStart)}&duration=${safeDuration}&format=fmp4`;

	// Ищем или создаём плеер
	let playerContainer = document.getElementById('player-container');
	if (!playerContainer) {
		playerContainer = document.createElement('div');
		playerContainer.id = 'player-container';
		playerContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 1px solid #ddd;
            padding: 20px;
            z-index: 1000;
            box-shadow: 0 0 20px rgba(0,0,0,0.3);
            min-width: 600px;
            border-radius: 5px;
            max-width: 90vw;
            max-height: 90vh;
            overflow-y: auto;
        `;
		document.body.appendChild(playerContainer);
	}

	// Без проверки Range (сразу открываем плеер)
	displayPlayer(recordingUrl, pathName, segmentStart, safeDuration, playerContainer, null, null);
}

// Отображение плеера с диагностикой
function displayPlayer(recordingUrl, pathName, segmentStart, duration, playerContainer, supportsRange, contentLength) {
	if (window.vjsPlayer) {
		window.vjsPlayer.dispose();
		window.vjsPlayer = null;
	}

	const sizeStr = contentLength ? ` (${formatBytes(parseInt(contentLength))})` : '';

	playerContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div>
                <strong>${escapeHtml(pathName)}</strong><br>
                <small style="color: #666;">${escapeHtml(segmentStart)}</small><br>
                <small style="color: #999;">Длина: ${formatTime(duration)}${sizeStr}</small>
            </div>
            <button onclick="closePlayer()" style="background: #333; color: white; border: none; padding: 5px 10px; cursor: pointer; flex-shrink: 0;">✕</button>
        </div>
        <video id="player-video" class="video-js vjs-default-skin vjs-big-play-centered" controls preload="auto" playsinline></video>
        <div style="font-size: 0.75em; color: #999; word-break: break-all;">
            <details>
                <summary>URL и диагностика</summary>
                <div style="margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                    <button id="probe-fmp4-btn" type="button" data-url="${escapeHtml(recordingUrl)}" style="background: #333; color: white; border: none; padding: 5px 10px; cursor: pointer;">Проверить fMP4</button>
                    <small>Результат смотри в Console (F12)</small>
                </div>
                <code style="display: block; margin-top: 5px; padding: 5px; background: #f0f0f0;">${recordingUrl}</code>
            </details>
        </div>
    `;

	window.vjsPlayer = videojs('player-video', {
		controls: true,
		preload: 'auto',
		fluid: true,
	});
	initMseFmp4VideoJs(window.vjsPlayer, recordingUrl, duration);
	window.vjsPlayer.on('error', () => {
		const err = window.vjsPlayer.error();
		console.error('Video.js error:', err, 'src:', window.vjsPlayer.currentSrc());
	});

	const probeBtn = playerContainer.querySelector('#probe-fmp4-btn');
	if (probeBtn) {
		probeBtn.addEventListener('click', () => {
			const src = probeBtn.getAttribute('data-url') || '';
			const fmp4Url = src.replace(/([?&]format=)[^&]+/i, '$1fmp4');
			probeMp4Fragmentation(fmp4Url);
		});
	}

	// Создаём оверлей
	let overlay = document.getElementById('player-overlay');
	if (!overlay) {
		overlay = document.createElement('div');
		overlay.id = 'player-overlay';
		overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 999;
        `;
		overlay.onclick = closePlayer;
		document.body.appendChild(overlay);
	}
}

// Закрытие плеера
function closePlayer() {
	const playerContainer = document.getElementById('player-container');
	const overlay = document.getElementById('player-overlay');
	if (window.vjsPlayer) {
		window.vjsPlayer.dispose();
		window.vjsPlayer = null;
	}

	if (playerContainer) playerContainer.remove();
	if (overlay) overlay.remove();
}

// Форматирование времени
function formatTime(seconds) {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);

	if (h > 0) {
		return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}
	return `${m}:${String(s).padStart(2, '0')}`;
}

function parseRfc3339ToEpochNs(value) {
	if (!value) return null;

	const str = String(value).trim();
	const m = str.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)?$/);
	if (!m) return null;

	const base = m[1];
	const fracRaw = m[2] || '';
	const tz = m[3] || 'Z';

	// Парсим без дробной части (точность до секунды), а дробь добавляем сами (BigInt наносекунды).
	const baseDate = new Date(`${base}${tz}`);
	if (Number.isNaN(baseDate.getTime())) return null;

	const fracDigits = fracRaw.length;
	const frac9 = fracRaw ? fracRaw.padEnd(9, '0').slice(0, 9) : '0'.padStart(9, '0');
	const fracNs = BigInt(frac9);
	const epochNs = BigInt(baseDate.getTime()) * 1000000n + fracNs;

	return { epochNs, fracDigits };
}

function epochNsToRfc3339Utc(epochNs, fracDigits) {
	const ns = BigInt(epochNs);
	const ms = Number(ns / 1000000n);
	const d = new Date(ms);

	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	const hh = String(d.getUTCHours()).padStart(2, '0');
	const mi = String(d.getUTCMinutes()).padStart(2, '0');
	const ss = String(d.getUTCSeconds()).padStart(2, '0');
	const base = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;

	const digits = Math.max(0, Math.min(9, Number(fracDigits) || 0));
	if (digits === 0) return `${base}Z`;

	const remNs = ns % 1000000000n;
	const frac9 = remNs.toString().padStart(9, '0');
	const frac = frac9.slice(0, digits);
	return `${base}.${frac}Z`;
}

function buildPlaybackGetUrl(playbackUrl, pathParam, startIso, durationSeconds, format) {
	const fmt = format || 'mp4';
	return `${playbackUrl}/get?path=${encodeURIComponent(pathParam)}&start=${encodeURIComponent(startIso)}&duration=${Math.ceil(durationSeconds)}&format=${encodeURIComponent(fmt)}`;
}

function splitFmp4InitAndMedia(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let off = 0;
	let splitAt = null;

	while (off + 8 <= bytes.byteLength) {
		let size = view.getUint32(off, false);
		const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
		let header = 8;
		if (size === 1) {
			if (off + 16 > bytes.byteLength) break;
			const hi = view.getUint32(off + 8, false);
			const lo = view.getUint32(off + 12, false);
			size = hi * 2 ** 32 + lo;
			header = 16;
		} else if (size === 0) {
			break;
		}

		if (type === 'moof') {
			splitAt = off;
			break;
		}

		if (!Number.isFinite(size) || size < header) break;
		const next = off + size;
		if (next <= off || next > bytes.byteLength) break;
		off = next;
	}

	if (splitAt == null) return { init: bytes, media: new Uint8Array() };
	return { init: bytes.slice(0, splitAt), media: bytes.slice(splitAt) };
}

function sourceBufferUpdateEnd(sb) {
	return new Promise(resolve => {
		const handler = () => {
			sb.removeEventListener('updateend', handler);
			resolve();
		};
		sb.addEventListener('updateend', handler, { once: true });
	});
}

async function appendToSourceBuffer(sb, u8) {
	if (!u8 || u8.byteLength === 0) return;
	while (sb.updating) {
		await sourceBufferUpdateEnd(sb);
	}
	sb.appendBuffer(u8);
	await sourceBufferUpdateEnd(sb);
}

async function removeFromSourceBuffer(sb, start, end) {
	while (sb.updating) {
		await sourceBufferUpdateEnd(sb);
	}
	sb.remove(start, end);
	await sourceBufferUpdateEnd(sb);
}

function getBufferedEnd(videoEl) {
	const b = videoEl.buffered;
	if (!b || b.length === 0) return 0;
	return b.end(b.length - 1);
}

function isTimeBuffered(videoEl, time) {
	const t = Number(time);
	if (!Number.isFinite(t)) return false;
	const b = videoEl.buffered;
	if (!b || b.length === 0) return false;
	const eps = 0.05;
	for (let i = 0; i < b.length; i++) {
		const s = b.start(i);
		const e = b.end(i);
		if (t + eps >= s && t <= e - eps) return true;
	}
	return false;
}

function initMseFmp4VideoJs(player, recordingUrl, totalDuration) {
	const playbackUrlRaw = document.getElementById('playbackUrl').value.trim();
	const playbackUrl = playbackUrlRaw.replace(/\/+$/, '');
	const urlParams = new URL(recordingUrl);
	const pathParam = urlParams.searchParams.get('path') || '';
	const startParam = urlParams.searchParams.get('start') || '';
	const startParsed = parseRfc3339ToEpochNs(startParam);
	const startEpochNs = startParsed ? startParsed.epochNs : null;
	const startFracDigits = startParsed ? startParsed.fracDigits : 0;

	const state = {
		playbackUrl,
		pathParam,
		startParam,
		startEpochNs,
		startFracDigits,
		totalDuration: Math.max(0, Number(totalDuration) || 0),
		chunkSize: 30,
		mediaSource: null,
		sourceBuffer: null,
		initSegment: null,
		nextBaseTime: 0,
		inflight: false,
		isSeeking: false,
		sbQueue: Promise.resolve(),
		generation: 0,
		seekDebounce: null,
		lastRequestedTime: null,
		suppressSeeking: false,
		internalSetTime: false,
		objectUrl: null,
	};

	function enqueueSourceBufferOp(fn) {
		const prev = state.sbQueue;
		const next = (async () => {
			try {
				await prev;
			} catch {
				// ignore
			}
			return await fn();
		})();
		state.sbQueue = next;
		return next;
	}

	async function waitSourceBufferIdle(sb) {
		while (sb.updating) {
			await sourceBufferUpdateEnd(sb);
		}
	}

	function clamp(t) {
		const v = Math.max(0, Number(t) || 0);
		if (state.totalDuration <= 0) return 0;
		return Math.min(state.totalDuration - 0.01, v);
	}

	const origCurrentTime = player.currentTime.bind(player);

	// Video.js ограничивает seek по player.seekable().
	// Для MSE у браузера seekable часто равен buffered, из-за чего клик по таймлайну "не работает".
	// Делаем виртуально seekable на всю длительность записи.
	const origDuration = player.duration.bind(player);
	const origSeekable = player.seekable.bind(player);
	try {
		player.seekable = function () {
			try {
				if (Number.isFinite(state.totalDuration) && state.totalDuration > 0 && videojs && typeof videojs.createTimeRanges === 'function') {
					return videojs.createTimeRanges([[0, state.totalDuration]]);
				}
			} catch {
				// ignore
			}
			return origSeekable();
		};
	} catch {
		// ignore
	}

	// Перехватываем set currentTime (клик по таймлайну/ползунок) и делаем MSE seek.
	// Так работает надёжнее, чем полагаться на события seeking/seeked.
	try {
		player.currentTime = function (t) {
			if (t === undefined) return origCurrentTime();
			if (state.internalSetTime) return origCurrentTime(t);

			const target = clamp(t);
			state.lastRequestedTime = target;
			if (state.seekDebounce) clearTimeout(state.seekDebounce);
			state.seekDebounce = setTimeout(() => {
				handleSeek(state.lastRequestedTime);
			}, 200);

			// Обновляем UI немедленно (Video.js), даже если фактический буфер догрузим чуть позже.
			state.internalSetTime = true;
			try {
				origCurrentTime(target);
			} catch {
				// ignore
			} finally {
				state.internalSetTime = false;
			}
			return target;
		};
	} catch {
		// ignore
	}
	try {
		player.duration = function (d) {
			if (d === undefined) return state.totalDuration;
			return origDuration(d);
		};
	} catch {
		// ignore
	}

	if (!window.MediaSource || typeof window.MediaSource !== 'function') {
		console.warn('MediaSource not supported, falling back to direct MP4');
		player.src({ src: recordingUrl, type: 'video/mp4' });
		player.play().catch(() => {});
		return;
	}

	if (!window.MP4Box || typeof window.MP4Box.createFile !== 'function') {
		console.warn('MP4Box not available, falling back to direct MP4');
		player.src({ src: recordingUrl, type: 'video/mp4' });
		player.play().catch(() => {});
		return;
	}

	if (!state.playbackUrl || !state.startEpochNs) {
		console.warn('Missing playbackUrl or start time, falling back to direct MP4');
		player.src({ src: recordingUrl, type: 'video/mp4' });
		player.play().catch(() => {});
		return;
	}

	const tech = player.tech(true);
	const videoEl = tech && tech.el ? tech.el() : null;
	if (!videoEl || !(videoEl instanceof HTMLVideoElement)) {
		console.warn('No HTMLVideoElement found for MSE, falling back to direct MP4');
		player.src({ src: recordingUrl, type: 'video/mp4' });
		player.play().catch(() => {});
		return;
	}

	const buildStartIsoAt = (baseTimeSeconds) => {
		const base = Math.max(0, Math.floor(Number(baseTimeSeconds) || 0));
		if (base === 0) return state.startParam;
		return epochNsToRfc3339Utc(state.startEpochNs + BigInt(base) * 1000000000n, state.startFracDigits);
	};

	const fetchFmp4 = async (baseTimeSeconds, generation) => {
		const base = Math.max(0, Math.floor(Number(baseTimeSeconds) || 0));
		const startIso = buildStartIsoAt(base);
		const remaining = state.totalDuration - base;
		const dur = Math.min(state.chunkSize, Math.max(0, remaining));
		const url = buildPlaybackGetUrl(state.playbackUrl, state.pathParam, startIso, dur, 'fmp4');
		const res = await fetch(url, { method: 'GET', headers: { Accept: 'video/mp4' } });
		if (generation !== state.generation) return null;
		if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
		const u8 = new Uint8Array(await res.arrayBuffer());
		if (generation !== state.generation) return null;
		const { init, media } = splitFmp4InitAndMedia(u8);
		return { base, dur, init, media, url };
	};

	const detectCodec = (initU8) => {
		return new Promise((resolve, reject) => {
			const mp4boxfile = window.MP4Box.createFile();
			mp4boxfile.onError = (e) => reject(new Error(String(e)));
			mp4boxfile.onReady = (info) => {
				try {
					const codecs = Array.from(new Set((info.tracks || []).map(t => t.codec).filter(Boolean)));
					const codecStr = codecs.join(', ');
					const mime = codecStr ? `video/mp4; codecs="${codecStr}"` : 'video/mp4';
					resolve(mime);
				} catch (e) {
					reject(e);
				}
			};
			const ab = initU8.buffer.slice(initU8.byteOffset, initU8.byteOffset + initU8.byteLength);
			ab.fileStart = 0;
			mp4boxfile.appendBuffer(ab);
			mp4boxfile.flush();
		});
	};

	const ensureSourceBuffer = async (firstInit) => {
		if (state.sourceBuffer) return;
		const mime = await detectCodec(firstInit);
		console.log('MSE codec mime:', mime);
		if (!window.MediaSource.isTypeSupported(mime)) {
			console.warn('MSE type not supported:', mime);
			throw new Error(`MSE type not supported: ${mime}`);
		}
		state.sourceBuffer = state.mediaSource.addSourceBuffer(mime);
		state.sourceBuffer.mode = 'segments';
		try {
			state.mediaSource.duration = state.totalDuration;
		} catch {
			// ignore
		}
	};

	const appendChunk = async (chunk) => {
		if (!chunk) return;
		if (!state.sourceBuffer) {
			await ensureSourceBuffer(chunk.init);
		}

		const sb = state.sourceBuffer;
		if (!state.initSegment) {
			state.initSegment = chunk.init;
			await waitSourceBufferIdle(sb);
			sb.timestampOffset = 0;
			await appendToSourceBuffer(sb, chunk.init);
		}

		await waitSourceBufferIdle(sb);
		sb.timestampOffset = chunk.base;
		await appendToSourceBuffer(sb, chunk.media);
		state.nextBaseTime = Math.max(state.nextBaseTime, chunk.base + Math.max(1, Math.floor(chunk.dur)));
	};

	const pump = async () => {
		if (state.inflight) return;
		if (state.isSeeking) return;
		if (!state.sourceBuffer || !state.mediaSource) return;

		const current = player.currentTime();
		const bufferedEnd = getBufferedEnd(videoEl);
		if (!Number.isFinite(bufferedEnd)) return;

		// Докидываем чанки, чтобы постоянно иметь небольшой буфер вперёд.
		const targetEnd = Math.min(state.totalDuration, Math.max(current + 40, bufferedEnd + 20));
		const next = Math.floor(Math.max(state.nextBaseTime, bufferedEnd));
		if (next >= targetEnd - 1) return;

		const gen = state.generation;
		state.inflight = true;
		try {
			const chunk = await fetchFmp4(next, gen);
			if (gen !== state.generation || !chunk) return;
			await enqueueSourceBufferOp(() => appendChunk(chunk));
		} catch (e) {
			console.error('MSE pump error:', e);
		} finally {
			state.inflight = false;
		}
	};

	async function handleSeek(targetTime) {
		const t = clamp(targetTime);
		if (isTimeBuffered(videoEl, t)) {
			state.suppressSeeking = true;
			state.internalSetTime = true;
			try {
				player.currentTime(t);
			} finally {
				state.internalSetTime = false;
			}
			setTimeout(() => {
				state.suppressSeeking = false;
			}, 0);
			return;
		}

		const base = Math.max(0, Math.floor(t));
		const inChunk = t - base;
		const wasPlaying = !player.paused();
		const gen = ++state.generation;
		state.inflight = false;
		state.isSeeking = true;

		let chunk = null;
		try {
			chunk = await fetchFmp4(base, gen);
		} catch (e) {
			console.error('MSE seek fetch error:', e);
			state.isSeeking = false;
			return;
		}

		if (gen !== state.generation || !chunk) {
			state.isSeeking = false;
			return;
		}

		try {
			player.pause();
		} catch {}

		try {
			await enqueueSourceBufferOp(async () => {
				// Не очищаем буфер при позиционировании: сохраняем кеш.
				// Просто докидываем нужный чанк в нужную позицию таймлайна.
				await appendChunk(chunk);
			});
		} catch (e) {
			console.error('MSE seek error:', e);
			state.isSeeking = false;
			return;
		}

		state.isSeeking = false;

		state.suppressSeeking = true;
		state.internalSetTime = true;
		try {
			player.currentTime(base + inChunk);
		} finally {
			state.internalSetTime = false;
		}
		setTimeout(() => {
			state.suppressSeeking = false;
		}, 0);
		if (wasPlaying) player.play().catch(() => {});
	}

	const onSeeking = () => {
		if (state.suppressSeeking) return;
		if (state.internalSetTime) return;
		if (state.isSeeking) return;
		const t = player.currentTime();
		state.lastRequestedTime = t;
		if (state.seekDebounce) clearTimeout(state.seekDebounce);
		state.seekDebounce = setTimeout(() => {
			handleSeek(state.lastRequestedTime);
		}, 200);
	};

	player.on('timeupdate', pump);
	player.on('seeking', onSeeking);
	// На некоторых связках Video.js/MSE событие может лучше приходить от нативного video.
	videoEl.addEventListener('seeking', onSeeking);

	player.one('dispose', () => {
		if (state.seekDebounce) clearTimeout(state.seekDebounce);
		player.off('timeupdate', pump);
		player.off('seeking', onSeeking);
		videoEl.removeEventListener('seeking', onSeeking);
		if (state.mediaSource && state.mediaSource.readyState === 'open') {
			try {
				state.mediaSource.endOfStream();
			} catch {}
		}
		if (state.objectUrl) {
			try {
				URL.revokeObjectURL(state.objectUrl);
			} catch {}
			state.objectUrl = null;
		}
	});

	const mediaSource = new MediaSource();
	state.mediaSource = mediaSource;
	const objectUrl = URL.createObjectURL(mediaSource);
	state.objectUrl = objectUrl;
	player.src({ src: objectUrl, type: 'video/mp4' });

	mediaSource.addEventListener(
		'sourceopen',
		async () => {
			const gen = state.generation;
			try {
				const chunk = await fetchFmp4(0, gen);
				if (gen !== state.generation || !chunk) return;
				await ensureSourceBuffer(chunk.init);
				await appendChunk(chunk);
				player.play().catch(() => {});
			} catch (e) {
				console.error('MSE init error:', e);
				console.warn('Falling back to direct MP4:', recordingUrl);
				try {
					player.src({ src: recordingUrl, type: 'video/mp4' });
				} catch {}
				player.play().catch(() => {});
			}
		},
		{ once: true }
	);
}

async function probeMp4Fragmentation(url) {
	try {
		console.log('[probe] fetching:', url);

		let res = await fetch(url, {
			method: 'GET',
			headers: { Range: 'bytes=0-1048575', Accept: 'video/mp4' },
		});
		if (res.status !== 206 && res.status !== 200) {
			console.warn('[probe] unexpected status:', res.status, res.statusText);
		}
		if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

		const u8 = new Uint8Array(await res.arrayBuffer());
		const { init, media } = splitFmp4InitAndMedia(u8);

		console.log('[probe] bytes:', u8.byteLength, 'init:', init.byteLength, 'media:', media.byteLength, 'status:', res.status);
		console.log('[probe] moof found:', media.byteLength > 0);

		if (window.MP4Box && typeof window.MP4Box.createFile === 'function') {
			const mime = await new Promise((resolve, reject) => {
				const mp4boxfile = window.MP4Box.createFile();
				mp4boxfile.onError = (e) => reject(new Error(String(e)));
				mp4boxfile.onReady = (info) => {
					const codecs = Array.from(new Set((info.tracks || []).map(t => t.codec).filter(Boolean)));
					const codecStr = codecs.join(', ');
					resolve(codecStr ? `video/mp4; codecs="${codecStr}"` : 'video/mp4');
				};
				const ab = init.buffer.slice(init.byteOffset, init.byteOffset + init.byteLength);
				ab.fileStart = 0;
				mp4boxfile.appendBuffer(ab);
				mp4boxfile.flush();
			});
			console.log('[probe] codec mime:', mime);
		}
	} catch (e) {
		console.error('[probe] failed:', e);
	}
}


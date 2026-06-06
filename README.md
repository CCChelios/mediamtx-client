# front_mediamtx

Основная часть репозитория — **плеер** `scripts/player.js`: воспроизведение записей **MediaMTX Playback API** в **Video.js** с “бесшовной” перемоткой через **MSE** (Media Source Extensions) и `format=fmp4`.

`index.html` в этом репозитории — это **пример фронта** (как собрать список путей/записей и дернуть плеер).

## Требования

- Запущенный MediaMTX с включённым **Playback API** (обычно: `http://localhost:9996`).
- Для MSE‑перемотки нужен `format=fmp4` в `GET /get` (обычный `format=mp4` не содержит `moof` и для MSE не подходит).
- CORS/mixed content: страница должна иметь доступ к Playback API (и Web API, если используете пример).

## Плеер (`scripts/player.js`)

### Что делает

MediaMTX отдаёт запись по:

`GET /get?path=...&start=...&duration=...&format=fmp4`

Плеер:

- создаёт `MediaSource`/`SourceBuffer` с корректным MIME (`video/mp4; codecs="..."`), кодеки извлекает из init‑сегмента через `mp4box`;
- первый чанк режет на init+media (ищет первый `moof`), init добавляет один раз;
- дальше докачивает чанки вперёд по мере приближения к концу буфера;
- при перемотке **не очищает** буфер: докидывает нужный чанк и прыгает в позицию.

Важно: Video.js обычно ограничивает seek по `player.seekable()`. Для MSE у браузера `seekable` часто равен `buffered`, из‑за чего клик по таймлайну “не работает”. В `player.js` это обходится виртуальным `seekable` на всю длительность записи.

### Как подключить

`scripts/player.js` рассчитан на подключение “как есть” в страницу (без сборки) и создает глобальные функции.

Минимум для работы:

- `videojs` (Video.js)
- `MP4Box` (UMD сборка `mp4box.all.min.js`)
- `<input id="playbackUrl">` со значением базового URL Playback API (плеер читает его оттуда)

Пример:

```html
<input id="playbackUrl" value="http://localhost:9996">

<script src="https://vjs.zencdn.net/8.12.0/video.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js"></script>
<script src="scripts/player.js"></script>

<button onclick="playRecording('cam1','2026-03-12T00:00:00Z',60)">Play</button>
```

Параметры `playRecording(pathName, startIso, durationSeconds)` лучше брать из ответа `GET /list` (Playback API), чтобы формат `start` точно совпадал с тем, что ожидает MediaMTX.

## Example front (`index.html`)

`index.html` — статическая страница‑пример:

- показывает список путей через **Web API** (`GET /v3/paths/list`, обычно `http://localhost:9997`);
- показывает список сегментов записи через **Playback API** (`GET /list`) за интервал от `1970-01-01T00:00:00.000Z` до “сейчас”;
- по клику на сегмент открывает оверлей‑плеер через `playRecording(...)`.

## Запуск примера

```bash
python3 -m http.server 8080
```

Открой в браузере:

```text
http://localhost:8080
```

В интерфейсе проверь/укажи:

- `API URL` → `http://localhost:9997`
- `Playback URL` → `http://localhost:9996`

Нажми **“Загрузить пути”** → кликни по имени пути → выбери сегмент записи.

## Траблшутинг

### “Media could not be loaded…”

Чаще всего:

- нет доступа к `http://localhost:9996` (CORS / mixed content / неверный URL);
- запросы идут с `format=mp4` вместо `format=fmp4`;
- браузер не поддерживает MSE/кодек (см. `MSE type not supported` в консоли).

### `Unexpected token 'export'` в `mp4box`

Нужно подключать UMD‑сборку mp4box, а не ESM. В этом проекте используется `mp4box@0.5.2`.

### Логи

Открой DevTools → Console/Network:

- `MSE codec mime: ...` — какой MIME собрался для `SourceBuffer`;
- `MSE init error / MSE seek error / MSE pump error` — ошибки и стектрейсы.

## Лицензия

MIT (если нужно — добавь `LICENSE`).

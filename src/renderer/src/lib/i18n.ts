/**
 * 介面語言。語言清單與歡迎畫面的各國「你好」一致。
 * 翻譯範圍：選單列、功能區（分頁／群組／按鈕）、命令標題與提示、設定卡片標題。
 * 非中文語言查不到的字串退回英文；簡體中文做逐字轉換。面板內文尚未全部涵蓋。
 * 做法：以繁體中文原文當鍵，查不到就原樣顯示。
 */
export const LANGS = [
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'zh-CN', label: '简体中文' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
  { id: 'it', label: 'Italiano' },
  { id: 'ru', label: 'Русский' },
  { id: 'ar', label: 'العربية' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'pt', label: 'Português' }
] as const
export type LangId = (typeof LANGS)[number]['id']

import { EN, toSimplified } from './i18nExtra'
import { PANELS } from './i18nPanels'

const KEYS = [
  '檔案', '編輯', '插入', '格式', '檢視', '工具', '說明', '常用', '匯出', '復原',
  '字型', '段落', '保護', '尋找', '區塊', '連結與標記', '進階', '表格工具', '模式', '顯示',
  '縮放', '導覽', '寫作', '歷史與整理', '收集與保護', '專注', '匯出為', '偏好設定', '外觀', '排版',
  'AI 改寫', '自訂 CSS', '快捷鍵', '語言', '更新與關於', '調整', '查看', '關閉'
] as const

const D: Record<string, string[]> = {
  'zh-CN': ['文件', '编辑', '插入', '格式', '视图', '工具', '帮助', '常用', '导出', '撤销', '字体', '段落', '保护', '查找', '区块', '链接与标记', '高级', '表格工具', '模式', '显示', '缩放', '导航', '写作', '历史与整理', '收集与保护', '专注', '导出为', '偏好设置', '外观', '排版', 'AI 改写', '自定义 CSS', '快捷键', '语言', '更新与关于', '调整', '查看', '关闭'],
  en: ['File', 'Edit', 'Insert', 'Format', 'View', 'Tools', 'Help', 'Home', 'Export', 'Undo', 'Font', 'Paragraph', 'Protect', 'Find', 'Blocks', 'Links & marks', 'Advanced', 'Table tools', 'Mode', 'Display', 'Zoom', 'Navigate', 'Writing', 'History & organize', 'Collect & protect', 'Focus', 'Export as', 'Preferences', 'Appearance', 'Typography', 'AI rewrite', 'Custom CSS', 'Shortcuts', 'Language', 'Updates & about', 'Adjust', 'View', 'Close'],
  ja: ['ファイル', '編集', '挿入', '書式', '表示', 'ツール', 'ヘルプ', 'ホーム', 'エクスポート', '元に戻す', 'フォント', '段落', '保護', '検索', 'ブロック', 'リンクとマーク', '詳細', '表ツール', 'モード', '表示設定', 'ズーム', 'ナビ', '執筆', '履歴と整理', '収集と保護', '集中', '書き出し形式', '環境設定', '外観', '文字組み', 'AI リライト', 'カスタム CSS', 'ショートカット', '言語', '更新情報', '調整', '表示', '閉じる'],
  ko: ['파일', '편집', '삽입', '서식', '보기', '도구', '도움말', '홈', '내보내기', '실행 취소', '글꼴', '단락', '보호', '찾기', '블록', '링크 및 표시', '고급', '표 도구', '모드', '표시', '확대/축소', '탐색', '글쓰기', '기록 및 정리', '수집 및 보호', '집중', '내보내기 형식', '환경설정', '모양', '조판', 'AI 다듬기', '사용자 CSS', '단축키', '언어', '업데이트 및 정보', '조정', '보기', '닫기'],
  es: ['Archivo', 'Edición', 'Insertar', 'Formato', 'Ver', 'Herramientas', 'Ayuda', 'Inicio', 'Exportar', 'Deshacer', 'Fuente', 'Párrafo', 'Proteger', 'Buscar', 'Bloques', 'Enlaces y marcas', 'Avanzado', 'Herramientas de tabla', 'Modo', 'Visualización', 'Zoom', 'Navegación', 'Escritura', 'Historial y orden', 'Recopilar y proteger', 'Concentración', 'Exportar como', 'Preferencias', 'Apariencia', 'Tipografía', 'Reescritura con IA', 'CSS personalizado', 'Atajos', 'Idioma', 'Actualizaciones y acerca de', 'Ajustar', 'Ver', 'Cerrar'],
  fr: ['Fichier', 'Édition', 'Insertion', 'Format', 'Affichage', 'Outils', 'Aide', 'Accueil', 'Exporter', 'Annuler', 'Police', 'Paragraphe', 'Protéger', 'Rechercher', 'Blocs', 'Liens et repères', 'Avancé', 'Outils de tableau', 'Mode', 'Affichage', 'Zoom', 'Navigation', 'Écriture', 'Historique et organisation', 'Collecter et protéger', 'Concentration', 'Exporter en', 'Préférences', 'Apparence', 'Typographie', 'Réécriture IA', 'CSS personnalisé', 'Raccourcis', 'Langue', 'Mises à jour et à propos', 'Ajuster', 'Voir', 'Fermer'],
  de: ['Datei', 'Bearbeiten', 'Einfügen', 'Format', 'Ansicht', 'Werkzeuge', 'Hilfe', 'Start', 'Exportieren', 'Rückgängig', 'Schrift', 'Absatz', 'Schützen', 'Suchen', 'Blöcke', 'Links und Markierungen', 'Erweitert', 'Tabellentools', 'Modus', 'Anzeige', 'Zoom', 'Navigation', 'Schreiben', 'Verlauf und Ordnung', 'Sammeln und Schützen', 'Fokus', 'Exportieren als', 'Einstellungen', 'Erscheinungsbild', 'Typografie', 'KI-Umschreiben', 'Eigenes CSS', 'Tastenkürzel', 'Sprache', 'Updates und Info', 'Anpassen', 'Ansehen', 'Schließen'],
  it: ['File', 'Modifica', 'Inserisci', 'Formato', 'Visualizza', 'Strumenti', 'Aiuto', 'Home', 'Esporta', 'Annulla', 'Carattere', 'Paragrafo', 'Proteggi', 'Trova', 'Blocchi', 'Link e segni', 'Avanzate', 'Strumenti tabella', 'Modalità', 'Visualizzazione', 'Zoom', 'Navigazione', 'Scrittura', 'Cronologia e ordine', 'Raccogli e proteggi', 'Concentrazione', 'Esporta come', 'Preferenze', 'Aspetto', 'Tipografia', 'Riscrittura IA', 'CSS personalizzato', 'Scorciatoie', 'Lingua', 'Aggiornamenti e informazioni', 'Regola', 'Visualizza', 'Chiudi'],
  ru: ['Файл', 'Правка', 'Вставка', 'Формат', 'Вид', 'Инструменты', 'Справка', 'Главная', 'Экспорт', 'Отменить', 'Шрифт', 'Абзац', 'Защита', 'Поиск', 'Блоки', 'Ссылки и метки', 'Дополнительно', 'Работа с таблицами', 'Режим', 'Отображение', 'Масштаб', 'Навигация', 'Письмо', 'История и порядок', 'Сбор и защита', 'Фокус', 'Экспортировать как', 'Настройки', 'Оформление', 'Типографика', 'Перепись ИИ', 'Свой CSS', 'Горячие клавиши', 'Язык', 'Обновления и о программе', 'Настроить', 'Смотреть', 'Закрыть'],
  ar: ['ملف', 'تحرير', 'إدراج', 'تنسيق', 'عرض', 'أدوات', 'مساعدة', 'الرئيسية', 'تصدير', 'تراجع', 'الخط', 'الفقرة', 'حماية', 'بحث', 'كتل', 'الروابط والعلامات', 'متقدم', 'أدوات الجدول', 'الوضع', 'العرض', 'التكبير', 'التنقل', 'الكتابة', 'السجل والتنظيم', 'الجمع والحماية', 'التركيز', 'تصدير بصيغة', 'التفضيلات', 'المظهر', 'الطباعة', 'إعادة صياغة بالذكاء الاصطناعي', 'CSS مخصص', 'اختصارات', 'اللغة', 'التحديثات وحول', 'ضبط', 'عرض', 'إغلاق'],
  hi: ['फ़ाइल', 'संपादन', 'सम्मिलित करें', 'प्रारूप', 'देखें', 'उपकरण', 'सहायता', 'होम', 'निर्यात', 'पूर्ववत', 'फ़ॉन्ट', 'अनुच्छेद', 'सुरक्षा', 'खोजें', 'ब्लॉक', 'लिंक और चिह्न', 'उन्नत', 'तालिका उपकरण', 'मोड', 'प्रदर्शन', 'ज़ूम', 'नेविगेशन', 'लेखन', 'इतिहास और व्यवस्था', 'संग्रह और सुरक्षा', 'फ़ोकस', 'इस रूप में निर्यात', 'प्राथमिकताएँ', 'रूप-रंग', 'टाइपोग्राफ़ी', 'AI पुनर्लेखन', 'कस्टम CSS', 'शॉर्टकट', 'भाषा', 'अपडेट और परिचय', 'समायोजित करें', 'देखें', 'बंद करें'],
  pt: ['Arquivo', 'Editar', 'Inserir', 'Formatar', 'Exibir', 'Ferramentas', 'Ajuda', 'Início', 'Exportar', 'Desfazer', 'Fonte', 'Parágrafo', 'Proteger', 'Localizar', 'Blocos', 'Links e marcas', 'Avançado', 'Ferramentas de tabela', 'Modo', 'Exibição', 'Zoom', 'Navegação', 'Escrita', 'Histórico e organização', 'Coletar e proteger', 'Foco', 'Exportar como', 'Preferências', 'Aparência', 'Tipografia', 'Reescrita com IA', 'CSS personalizado', 'Atalhos', 'Idioma', 'Atualizações e sobre', 'Ajustar', 'Ver', 'Fechar']
}

const TABLES: Record<string, Map<string, string>> = {}
for (const [lang, arr] of Object.entries(D)) TABLES[lang] = new Map(KEYS.map((k, i) => [k, arr[i]]))

let current: string = 'zh-TW'
export function setLang(id: string): void {
  current = id
  try {
    document.documentElement.lang = id
  } catch {
    /* 非瀏覽器環境 */
  }
}
export const getLang = (): string => current
/** 翻譯一個繁體中文原文；沒有對應就原樣回傳 */
export function tr(zh: string): string {
  if (current === 'zh-TW') return zh
  const hit = TABLES[current]?.get(zh)
  if (hit) return hit
  if (current === 'zh-CN') return toSimplified(zh)
  // 其他語言：查不到就退回英文，再不行才顯示原文
  return EN[zh] ?? PANELS[zh] ?? zh
}
export const I18N_KEYS = KEYS
export const I18N_TABLES = D

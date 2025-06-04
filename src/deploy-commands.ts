import { REST } from '@discordjs/rest'
import { BunnyLogger } from 'bunny-log'
import { Routes } from 'discord-api-types/v10'
import { env } from 'node:process'

const { BOT_TOKEN, BOT_CLIENT_ID } = env
const bunLog = new BunnyLogger(false).hex('discord', '#5865f2')

if (!BOT_TOKEN || !BOT_CLIENT_ID) {
	bunLog.log('error', 'Missing BOT_TOKEN or CLIENT_ID in .env file')
	process.exit(1)
}

const commands = [
	{
		name: 'level',
		name_localizations: {
			da: 'niveau',
			de: 'level',
			'en-GB': 'level',
			'en-US': 'level',
			'es-ES': 'nivel',
			'es-419': 'nivel',
			fr: 'niveau',
			hr: 'razina',
			it: 'livello',
			lt: 'lygis',
			hu: 'szint',
			nl: 'niveau',
			no: 'nivå',
			pl: 'poziom',
			'pt-BR': 'nivel',
			ro: 'nivel',
			fi: 'taso',
			'sv-SE': 'nivå',
			vi: 'cấp_độ',
			tr: 'seviye',
			cs: 'úroveň',
			el: 'επίπεδο',
			bg: 'ниво',
			ru: 'уровень',
			uk: 'рівень',
			hi: 'स्तर',
			th: 'ระดับ',
			'zh-CN': '等级',
			ja: 'レベル',
			'zh-TW': '等級',
			ko: '레벨',
		},
		description: 'Manage user levels',
		description_localizations: {
			da: 'Administrer brugerniveauer',
			de: 'Benutzerebenen verwalten',
			'en-GB': 'Manage user levels',
			'en-US': 'Manage user levels',
			'es-ES': 'Gestionar niveles de usuario',
			'es-419': 'Gestionar niveles de usuario',
			fr: 'Gérer les niveaux utilisateur',
			hr: 'Upravljaj korisničkim razinama',
			it: 'Gestisci livelli utente',
			lt: 'Valdyti vartotojų lygius',
			hu: 'Felhasználói szintek kezelése',
			nl: 'Gebruikersniveaus beheren',
			no: 'Administrer brukernivåer',
			pl: 'Zarządzaj poziomami użytkowników',
			'pt-BR': 'Gerenciar níveis de usuário',
			ro: 'Gestionați nivelurile utilizatorilor',
			fi: 'Hallitse käyttäjätasoja',
			'sv-SE': 'Hantera användarnivåer',
			vi: 'Quản lý cấp độ người dùng',
			tr: 'Kullanıcı seviyelerini yönet',
			cs: 'Spravovat uživatelské úrovně',
			el: 'Διαχείριση επιπέδων χρήστη',
			bg: 'Управлявайте потребителските нива',
			ru: 'Управлять уровнями пользователей',
			uk: 'Керувати рівнями користувачів',
			hi: 'उपयोगकर्ता स्तर प्रबंधित करें',
			th: 'จัดการระดับผู้ใช้',
			'zh-CN': '管理用户等级',
			ja: 'ユーザーレベルを管理',
			'zh-TW': '管理用戶等級',
			ko: '사용자 레벨 관리',
		},
		options: [
			{
				type: 1, // SUB_COMMAND
				name: 'show',
				name_localizations: {
					da: 'vis',
					de: 'zeigen',
					'en-GB': 'show',
					'en-US': 'show',
					'es-ES': 'mostrar',
					'es-419': 'mostrar',
					fr: 'afficher',
					hr: 'prikaži',
					it: 'mostra',
					lt: 'rodyti',
					hu: 'mutat',
					nl: 'tonen',
					no: 'vis',
					pl: 'pokaż',
					'pt-BR': 'mostrar',
					ro: 'arată',
					fi: 'näytä',
					'sv-SE': 'visa',
					vi: 'hiển_thị',
					tr: 'göster',
					cs: 'zobrazit',
					el: 'εμφάνιση',
					bg: 'покажи',
					ru: 'показать',
					uk: 'показати',
					hi: 'दिखाएं',
					th: 'แสดง',
					'zh-CN': '显示',
					ja: '表示',
					'zh-TW': '顯示',
					ko: '보기',
				},
				description: "Show a user's level",
				description_localizations: {
					da: 'Vis en brugers niveau',
					de: 'Zeige das Level eines Benutzers',
					'en-GB': "Show a user's level",
					'en-US': "Show a user's level",
					'es-ES': 'Mostrar el nivel de un usuario',
					'es-419': 'Mostrar el nivel de un usuario',
					fr: "Afficher le niveau d'un utilisateur",
					hr: 'Prikaži korisničku razinu',
					it: 'Mostra il livello di un utente',
					lt: 'Rodyti vartotojo lygį',
					hu: 'Felhasználó szintjének megjelenítése',
					nl: 'Toon het niveau van een gebruiker',
					no: 'Vis en brukers nivå',
					pl: 'Pokaż poziom użytkownika',
					'pt-BR': 'Mostrar o nível de um usuário',
					ro: 'Afișează nivelul unui utilizator',
					fi: 'Näytä käyttäjän taso',
					'sv-SE': 'Visa en användares nivå',
					vi: 'Hiển thị cấp độ của người dùng',
					tr: 'Bir kullanıcının seviyesini göster',
					cs: 'Zobrazit úroveň uživatele',
					el: 'Εμφάνιση επιπέδου χρήστη',
					bg: 'Покажи нивото на потребителя',
					ru: 'Показать уровень пользователя',
					uk: 'Показати рівень користувача',
					hi: 'उपयोगकर्ता का स्तर दिखाएं',
					th: 'แสดงระดับของผู้ใช้',
					'zh-CN': '显示用户等级',
					ja: 'ユーザーのレベルを表示',
					'zh-TW': '顯示用戶等級',
					ko: '사용자 레벨 보기',
				},
				options: [
					{
						type: 6, // USER
						name: 'user',
						description: 'User to check',
						required: false,
					},
				],
			},
			{
				type: 1, // SUB_COMMAND
				name: 'set',
				description: 'Set user level (Admin only)',
				default_member_permissions: '0',
				options: [
					{
						type: 6, // USER
						name: 'user',
						description: 'User to modify',
						required: true,
					},
					{
						type: 10, // NUMBER
						name: 'xp',
						description: 'XP value to set',
						required: true,
					},
					{
						type: 10, // NUMBER
						name: 'level',
						description: 'Level to set',
						required: true,
					},
				],
				name_localizations: {
					'en-US': 'set',
					fr: 'set',
					'es-ES': 'set',
					de: 'set',
					'zh-CN': 'set',
					ru: 'set',
					'pt-BR': 'set',
					ar: 'set',
					hi: 'set',
					ja: 'set',
					ko: 'set',
				},
			},
		],
	},
	{
		name: 'eco',
		name_localizations: {
			da: 'økonomi',
			de: 'wirtschaft',
			'en-GB': 'economy',
			'en-US': 'economy',
			'es-ES': 'economia',
			'es-419': 'economia',
			fr: 'economie',
			hr: 'ekonomija',
			it: 'economia',
			lt: 'ekonomika',
			hu: 'gazdaság',
			nl: 'economie',
			no: 'økonomi',
			pl: 'ekonomia',
			'pt-BR': 'economia',
			ro: 'economie',
			fi: 'talous',
			'sv-SE': 'ekonomi',
			vi: 'kinh_tế',
			tr: 'ekonomi',
			cs: 'ekonomika',
			el: 'οικονομία',
			bg: 'икономика',
			ru: 'экономика',
			uk: 'економіка',
			hi: 'अर्थव्यवस्था',
			th: 'เศรษฐกิจ',
			'zh-CN': '经济',
			ja: '経済',
			'zh-TW': '經濟',
			ko: '경제',
		},
		description: 'Manage the server economy',
		description_localizations: {
			da: 'Administrer serverøkonomien',
			de: 'Verwalte die Serverwirtschaft',
			'en-GB': 'Manage the server economy',
			'en-US': 'Manage the server economy',
			'es-ES': 'Gestionar la economía del servidor',
			'es-419': 'Gestionar la economía del servidor',
			fr: "Gérer l'économie du serveur",
			hr: 'Upravljaj ekonomijom servera',
			it: "Gestisci l'economia del server",
			lt: 'Valdyti serverio ekonomiką',
			hu: 'A szerver gazdaságának kezelése',
			nl: 'Beheer de servereconomie',
			no: 'Administrer serverøkonomien',
			pl: 'Zarządzaj ekonomią serwera',
			'pt-BR': 'Gerenciar a economia do servidor',
			ro: 'Gestionați economia serverului',
			fi: 'Hallitse palvelimen taloutta',
			'sv-SE': 'Hantera serverns ekonomi',
			vi: 'Quản lý kinh tế máy chủ',
			tr: 'Sunucu ekonomisini yönet',
			cs: 'Spravovat ekonomiku serveru',
			el: 'Διαχείριση οικονομίας διακομιστή',
			bg: 'Управлявайте икономиката на сървъра',
			ru: 'Управлять экономикой сервера',
			uk: 'Керувати економікою сервера',
			hi: 'सर्वर अर्थव्यवस्था प्रबंधित करें',
			th: 'จัดการเศรษฐกิจของเซิร์ฟเวอร์',
			'zh-CN': '管理服务器经济',
			ja: 'サーバー経済を管理',
			'zh-TW': '管理伺服器經濟',
			ko: '서버 경제 관리',
		},
		options: [
			{
				type: 1, // SUB_COMMAND
				name: 'balance',
				description: 'Check your balance',
				options: [
					{
						type: 6, // USER
						name: 'user',
						description: 'The user to check balance for',
						required: false,
					},
				],
			},
			{
				type: 1, // SUB_COMMAND
				name: 'pay',
				description: 'Pay another user',
				options: [
					{
						type: 6, // USER
						name: 'user',
						description: 'The user to pay',
						required: true,
					},
					{
						type: 10, // NUMBER
						name: 'amount',
						description: 'The amount to pay',
						required: true,
						min_value: 1,
					},
				],
			},
			{
				type: 1, // SUB_COMMAND
				name: 'leaderboard',
				description: 'Show the wealth leaderboard',
			},
		],
	},
	{
		name: 'config',
		name_localizations: {
			da: 'konfigurer',
			de: 'konfigurieren',
			'en-GB': 'config',
			'en-US': 'config',
			'es-ES': 'configurar',
			'es-419': 'configurar',
			fr: 'configurer',
			hr: 'konfiguracija',
			it: 'configura',
			lt: 'konfigūruoti',
			hu: 'konfiguráció',
			nl: 'configureren',
			no: 'konfigurer',
			pl: 'konfiguruj',
			'pt-BR': 'configurar',
			ro: 'configurează',
			fi: 'määritä',
			'sv-SE': 'konfigurera',
			vi: 'cấu_hình',
			tr: 'yapılandır',
			cs: 'konfigurace',
			el: 'διαμόρφωση',
			bg: 'конфигурация',
			ru: 'настроить',
			uk: 'налаштувати',
			hi: 'कॉन्फ़िगर',
			th: 'ตั้งค่า',
			'zh-CN': '配置',
			ja: '設定',
			'zh-TW': '配置',
			ko: '설정',
		},
		description: 'Configure bot plugins and settings',
		description_localizations: {
			da: 'Konfigurer bot-plugins og indstillinger',
			de: 'Bot-Plugins und Einstellungen konfigurieren',
			'en-GB': 'Configure bot plugins and settings',
			'en-US': 'Configure bot plugins and settings',
			'es-ES': 'Configurar plugins y ajustes del bot',
			'es-419': 'Configurar plugins y ajustes del bot',
			fr: 'Configurer les plugins et paramètres du bot',
			hr: 'Konfiguriraj dodatke i postavke bota',
			it: 'Configura plugin e impostazioni del bot',
			lt: 'Konfigūruoti boto papildinius ir nustatymus',
			hu: 'Bot bővítmények és beállítások konfigurálása',
			nl: 'Configureer bot-plugins en instellingen',
			no: 'Konfigurer bot-plugins og innstillinger',
			pl: 'Konfiguruj wtyczki i ustawienia bota',
			'pt-BR': 'Configurar plugins e configurações do bot',
			ro: 'Configurați pluginurile și setările botului',
			fi: 'Määritä botin lisäosat ja asetukset',
			'sv-SE': 'Konfigurera bot-plugins och inställningar',
			vi: 'Cấu hình plugin và cài đặt bot',
			tr: 'Bot eklentilerini ve ayarlarını yapılandır',
			cs: 'Konfigurace pluginů a nastavení bota',
			el: 'Διαμόρφωση πρόσθετων και ρυθμίσεων bot',
			bg: 'Конфигуриране на плъгини и настройки на бота',
			ru: 'Настроить плагины и параметры бота',
			uk: 'Налаштувати плагіни та параметри бота',
			hi: 'बॉट प्लगइन्स और सेटिंग्स कॉन्फ़िगर करें',
			th: 'กำหนดค่าปลั๊กอินและการตั้งค่าบอท',
			'zh-CN': '配置机器人插件和设置',
			ja: 'ボットプラグインと設定を構成',
			'zh-TW': '配置機器人插件和設定',
			ko: '봇 플러그인 및 설정 구성',
		},
		default_member_permissions: '32', // MANAGE_GUILD permission
		options: [
			{
				type: 3, // STRING
				name: 'plugin',
				description: 'The plugin to configure',
				description_localizations: {
					'en-US': 'The plugin to configure',
					fr: 'Le plugin à configurer',
					'es-ES': 'El plugin a configurar',
					de: 'Das Plugin zu konfigurieren',
					'zh-CN': '要配置的插件',
					ru: 'Плагин для настройки',
					'pt-BR': 'Plugin para configurar',
					ar: 'بوت للتكوين',
					hi: 'प्लगइन को सुनिश्चित करें',
					ja: 'プラグインを構成する',
					ko: '플러그인을 구성하세요',
					pl: 'Plugin do konfiguracji',
				},
				required: true,
				choices: [
					{
						name: 'Tickets',
						name_localizations: {
							'en-US': 'Tickets',
							fr: 'Tickets',
							'es-ES': 'Tickets',
							de: 'Tickets',
							'zh-CN': 'Tickets',
							ru: 'Билеты',
							'pt-BR': 'Tickets',
							ar: 'تذاكر',
							hi: 'टिकट',
							ja: 'チケット',
							ko: '티켓',
							pl: 'Bilety',
						},
						value: 'tickets',
					},
					{
						name: 'Starboard',
						name_localizations: {
							'en-US': 'Starboard',
							fr: 'Tableau de bord',
							'es-ES': 'Tablero',
							de: 'Starboard',
							'zh-CN': '星板',
							ru: 'Старборд',
							'pt-BR': 'Starboard',
							ar: 'Starboard',
							hi: 'स्टारबोर्ड',
							ja: 'スターボード',
							ko: '스타보드',
							pl: 'Starboard',
						},
						value: 'starboard',
					},
					{
						name: 'Levels',
						name_localizations: {
							'en-US': 'Levels',
							fr: 'Niveaux',
							'es-ES': 'Niveles',
							de: 'Stufen',
							'zh-CN': '等级',
							ru: 'Уровни',
							'pt-BR': 'Níveis',
							ar: 'مستويات',
							hi: 'स्तर',
							ja: 'レベル',
							ko: '레벨',
							pl: 'Poziomy',
						},
						value: 'levels',
					},
					{
						name: 'Welcome & Goodbye',
						name_localizations: {
							'en-US': 'Welcome & Goodbye',
							fr: 'Bienvenue & Au revoir',
							'es-ES': 'Bienvenido & Despedida',
							de: 'Willkommen & Abschied',
							'zh-CN': '欢迎 & 告别',
							ru: 'Добро пожаловать & Прощание',
							'pt-BR': 'Bem-vindo & Despedida',
							ar: 'مرحبا & سلام',
							hi: 'नमस्ते & अलविदा',
							ja: 'ようこそ & お別れ',
							ko: '환영 & 안녕히 가세요',
							pl: 'Witaj & Do widzenia',
						},
						value: 'welcome_goodbye',
					},
					{
						name: 'Birthday',
						name_localizations: {
							'en-US': 'Birthday',
							fr: 'Anniversaire',
							'es-ES': 'Cumpleaños',
							de: 'Geburtstag',
							'zh-CN': '生日',
							ru: 'День рождения',
							'pt-BR': 'Aniversário',
							ar: 'عيد ميلاد',
							hi: 'जन्मदिन',
							ja: '誕生日',
							ko: '생일',
							pl: 'Urodziny',
						},
						value: 'birthday',
					},
					{
						name: 'Temporary VC',
						name_localizations: {
							'en-US': 'Temporary VC',
							fr: 'VC temporaire',
							'es-ES': 'VC temporal',
							de: 'Temporärer VC',
							'zh-CN': '临时语音频道',
							ru: 'Временный VC',
							'pt-BR': 'VC temporário',
							ar: 'VC مؤقت',
							hi: 'अस्थायी वीसी',
							ja: '一時的なVC',
							ko: '임시 VC',
							pl: 'Tymczasowy VC',
						},
						value: 'tempvc',
					},
					{
						name: 'Economy',
						name_localizations: {
							'en-US': 'Economy',
							fr: 'Économie',
							'es-ES': 'Economía',
							de: 'Wirtschaft',
							'zh-CN': '经济',
							ru: 'Экономика',
							'pt-BR': 'Economia',
							ar: 'الاقتصاد',
							hi: 'अर्थव्यवस्था',
							ja: '経済',
							ko: '경제',
							pl: 'Gospodarka',
						},
						value: 'economy',
					},
					{
						name: 'Music',
						name_localizations: {
							'en-US': 'Music',
							fr: 'Musique',
							'es-ES': 'Música',
							de: 'Musik',
							'zh-CN': '音乐',
							ru: 'Музыка',
							'pt-BR': 'Música',
							ar: 'موسيقى',
							hi: 'संगीत',
							ja: '音楽',
							ko: '음악',
							pl: 'Muzyka',
						},
						value: 'music',
					},
					{
						name: 'Moderation',
						name_localizations: {
							'en-US': 'Moderation',
							fr: 'Modération',
							'es-ES': 'Moderación',
							de: 'Moderation',
							'zh-CN': '管理',
							ru: 'Модерация',
							'pt-BR': 'Moderação',
							ar: 'التصفية',
							hi: 'नियंत्रण',
							ja: 'モデレーション',
							ko: '모더레이션',
							pl: 'Moderacja',
						},
						value: 'moderation',
					},
				],
			},
		],
	},
	{
		name: 'ticket',
		description: 'Manage tickets',
		options: [
			{
				type: 1, // SUB_COMMAND
				name: 'manage',
				description: 'Manage tickets',
				options: [
					{
						type: 3, // STRING
						name: 'action',
						description: 'Action to perform on the ticket',
						required: true,
						choices: [
							{
								name: 'Close',
								value: 'close',
							},
							{
								name: 'Claim',
								value: 'claim',
							},
							{
								name: 'Join',
								value: 'join',
							},
							{
								name: 'Add User',
								value: 'add',
							},
							{
								name: 'Remove User',
								value: 'remove',
							},
						],
					},
					{
						type: 3, // STRING
						name: 'reason',
						description:
							'Reason for closing the ticket (when using close action)',
						required: false,
					},
					{
						type: 6, // USER
						name: 'user',
						description:
							'User to add or remove (when using add/remove actions)',
						required: false,
					},
				],
			},
			{
				type: 1, // SUB_COMMAND
				name: 'list',
				description: 'List all active tickets',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'send_panel',
				description: 'Send a ticket panel in the specified channel',
				options: [
					{
						type: 7, // CHANNEL
						name: 'channel',
						description: 'The channel to send the ticket panel to',
						required: true,
					},
				],
			},
		],
	},
	{
		name: 'bday',
		name_localizations: {
			'zh-CN': '生日',
			'es-ES': 'cumpleanos',
			'pt-BR': 'aniversario',
			fr: 'anniversaire',
			de: 'geburtstag',
			ru: 'день_рождения',
			ja: '誕生日',
			ko: '생일',
		},
		description: 'Manage birthday information',
		description_localizations: {
			'en-US': 'Manage birthday information',
			fr: 'Gérer les informations de naissance',
			'es-ES': 'Gestionar información de cumpleaños',
			de: 'Gestaltung Geburtstagsinformationen',
			'zh-CN': '管理生日信息',
			ru: 'Управление информацией о дне рождения',
			'pt-BR': 'Gerenciar informações de aniversário',
			ar: 'إدارة المعلومات المولدية',
			hi: 'जन्मदिन के बारे में जानकारी प्रबंधित करें',
			ja: '誕生日の情報を管理する',
			ko: '생일 정보 관리',
		},
		options: [
			{
				type: 1, // SUB_COMMAND
				name: 'set',
				description: 'Set your birthday',
				description_localizations: {
					'en-US': 'Set your birthday',
					fr: 'Définir votre anniversaire',
					'es-ES': 'Establecer tu cumpleaños',
					de: 'Setze dein Geburtstag',
					'zh-CN': '设置你的生日',
					ru: 'Установить ваш день рождения',
					'pt-BR': 'Definir seu aniversário',
					ar: 'تعيين يوم ميلادك',
					hi: 'आपके जन्मदिन सेट करें',
					ja: 'あなたの誕生日を設定する',
					ko: '생일을 설정하세요',
				},
				options: [
					{
						type: 4, // INTEGER
						name: 'day',
						description: 'Birthday day (1-31)',
						description_localizations: {
							'en-US': 'Birthday day (1-31)',
							fr: 'Jour de naissance (1-31)',
							'es-ES': 'Día de cumpleaños (1-31)',
							de: 'Geburtstagstag (1-31)',
							'zh-CN': '生日日 (1-31)',
							ru: 'День рождения (1-31)',
							'pt-BR': 'Dia do aniversário (1-31)',
							ar: 'يوم الميلاد (1-31)',
							hi: 'जन्मदिन का दिन (1-31)',
							ja: '誕生日の日 (1-31)',
							ko: '생일 날짜 (1-31)',
						},
						required: true,
						min_value: 1,
						max_value: 31,
					},
					{
						type: 4, // INTEGER
						name: 'month',
						description: 'Birthday month (1-12)',
						required: true,
						min_value: 1,
						max_value: 12,
					},
					{
						type: 4, // INTEGER
						name: 'year',
						description: 'Birth year',
						required: true,
						min_value: new Date().getFullYear() - 100,
						max_value: new Date().getFullYear(),
					},
				],
			},
			{
				type: 1, // SUB_COMMAND
				name: 'show',
				description: 'Show your birthday information',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'remove',
				description: 'Remove your birthday information',
			},
		],
	},
	{
		name: 'music',
		description: 'Manage music playback',
		options: [
			{
				type: 1, // SUB_COMMAND
				name: 'play',
				description: 'Play a song',
				options: [
					{
						type: 3, // STRING
						name: 'query',
						description: 'url of the song to play',
						required: true,
					},
				],
			},
			{
				type: 1, // SUB_COMMAND
				name: 'pause',
				description: 'Pause the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'resume',
				description: 'Resume the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'skip',
				description: 'Skip the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'stop',
				description: 'Stop the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'queue',
				description: 'Show the current song queue',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'clear',
				description: 'Clear the current song queue',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'remove',
				description: 'Remove a song from the queue',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'shuffle',
				description: 'Shuffle the current song queue',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'loop',
				description: 'Loop the current song queue',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'volume',
				description: 'Set the volume of the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'nowplaying',
				description: 'Show the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'lyrics',
				description: 'Show the lyrics of the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'search',
				description: 'Search for a song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'playlist',
				description: 'Manage your playlists',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'history',
				description: 'Show the history of the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'help',
				description: 'Show the help menu',
			},
		],
	},
	// 	name: 'plugin',
	// 	description: 'Manage your Minecraft account',
	// 	options: [

	// 		{
	// 			type: 1, // SUB_COMMAND
	// 			name: 'game',
	// 			description: 'Manage your game plugins',
	// 			options: [
	// 				{
	// 					type: 3, // STRING
	// 					name: 'minecraft',
	// 					description: 'The name of the game to manage',
	// 					required: true,
	// 				},
	// 			],
	// 		},
	// 		{
	// 			type: 1, // SUB_COMMAND
	// 			name: 'info',
	// 			description: 'Get info about a specified game plugin',
	// 			options: [
	// 				{
	// 					type: 3, // STRING
	// 					name: 'plugin_name',
	// 					description: 'The name of the game plugin to get info about',
	// 					required: true,
	// 				},
	// 			],
	// 		},
	// 	],
	// },
]

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN)
;(async () => {
	try {
		bunLog.log('discord', 'Started refreshing application (/) commands.')

		await rest.put(Routes.applicationCommands(BOT_CLIENT_ID), {
			body: commands,
		})

		bunLog.log('success', 'Successfully reloaded application (/) commands.')
	} catch (error) {
		bunLog.log('error', error)
	}
})()

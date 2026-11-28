// Texts of the plugin in Steam's language: English, Italian; any other language shows the English ones
const ITALIAN: Record<string, string> = {
	Options: 'Opzioni',
	'Use general settings': 'Usa impostazioni generali',
	Colour: 'Colore',
	Numbers: 'Numeri',
	'Controller icons': 'Icone controller',
	Battery: 'Batteria',
	Percentage: 'Percentuale',
	'Dot colour': 'Colore del pallino',
	'Back to the LED colour set in Steam': 'Torna al colore del LED impostato in Steam',
	'Scroll to zoom': 'Usa la rotella per lo zoom',
	'Last {n} h': 'Ultime {n} h',
	'Last {n} days': 'Ultimi {n} giorni',
	'Now: {n}%': 'Ora: {n}%',
	' (charging)': ' (in carica)',
	'In game: {n}% per hour': 'In gioco: {n}% all’ora',
	'Outside games: {n}% per hour': 'Fuori dai giochi: {n}% all’ora',
	'About {n} of play left': 'Circa {n} di gioco rimasto',
	'About {n} left': 'Circa {n} rimasto',
	'Wait for more data for a more precise estimate.': 'Servono più dati per una stima più precisa.',
	'No readings yet.': 'Ancora nessuna lettura.',
	'Steam Controller only': 'Solo Steam Controller',
	'When off, every wireless controller with a known battery level is shown.':
		'Se spento, compare ogni controller senza fili di cui si conosce il livello della batteria.',
	'Battery level not available': 'Livello della batteria non disponibile',
	'Battery level not available over a USB cable': 'Livello della batteria non disponibile col cavo USB',
	'xbox-usb-note': 'Col cavo USB il livello della batteria non si può leggere: collega il controller in Bluetooth.',
	'xbox-usb-howto':
		'Associalo nelle impostazioni Bluetooth di Windows. Con il ricevitore wireless Xbox il livello si vede a quattro gradini (vuota, bassa, media, piena). I controller Xbox One precedenti al modello 1708 (2016) non hanno il Bluetooth.',
	'Level from the Xbox Wireless Adapter: in four steps': 'Livello dal ricevitore wireless Xbox: a quattro gradini',
};

const ENGLISH: Record<string, string> = {
	'xbox-usb-note': "Over a USB cable the battery level can't be read: connect the controller over Bluetooth.",
	'xbox-usb-howto':
		"Pair it in Windows' Bluetooth settings. Through the Xbox Wireless Adapter the level shows in four steps (empty, low, medium, full). Xbox One controllers older than model 1708 (2016) have no Bluetooth.",
};

let language = 'english';

export async function loadLanguage() {
	try {
		language = String(await (window as any).SteamClient.Settings.GetCurrentLanguage()).replace(/^"|"$/g, '') || 'english';
	} catch {
		language = 'english';
	}
}

// The text in Steam's language, with {n} replaced by the value given
export function t(text: string, n?: string | number) {
	const found = (language === 'italian' ? ITALIAN[text] : undefined) ?? ENGLISH[text] ?? text;
	return n === undefined ? found : found.replace('{n}', String(n));
}

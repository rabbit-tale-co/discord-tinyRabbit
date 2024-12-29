const formatter = new Intl.NumberFormat()
const hexToNumber = (hex: string) => Number.parseInt(hex.replace('#', ''), 16)

export { formatter, hexToNumber }

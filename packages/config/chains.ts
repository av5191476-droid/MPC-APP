// T019. Direcciones a verificar contra los despliegues canónicos antes de usar.
export const ENTRY_POINT_V08 = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108' as const;

export const chains = {
  base:        { id: 8453,  name: 'Base',         native: 'ETH', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  arbitrum:    { id: 42161, name: 'Arbitrum One', native: 'ETH', usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  polygon:     { id: 137,   name: 'Polygon PoS',  native: 'POL', usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
  baseSepolia: { id: 84532, name: 'Base Sepolia', native: 'ETH', usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
} as const;

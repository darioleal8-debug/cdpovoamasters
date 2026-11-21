/** Cores do botão do relógio: verde = "Start" (relógio parado), vermelho = "Stop" (relógio a correr). */
export function clockButtonColors(running: boolean): { background: string; color: string } {
  return { background: running ? "#dc2626" : "#16a34a", color: "#ffffff" };
}

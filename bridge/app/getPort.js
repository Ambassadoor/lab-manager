import { SerialPort } from "serialport"

async function findScalePort() {
  const ports = await SerialPort.list();
  
  // Look for your USB-to-serial adapter
  const scalePort = ports.find(port => 
    port.manufacturer?.toLowerCase().includes('prolific') ||
    port.manufacturer?.toLowerCase().includes('ftdi') ||
    port.path.includes('usbserial')
  );
  
  return scalePort?.path || 'COM1'; // fallback
}

const test = await findScalePort();

console.log(test)
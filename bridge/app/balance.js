import { SerialPort } from 'serialport';
import { autoDetect } from '@serialport/bindings-cpp'
import { ReadlineParser } from '@serialport/parser-readline';

// return an array of all non bluetooth ports and non-empty keys
const findPort = async () => {
  const binding = autoDetect();
  const allPorts = await binding.list()

  const nonBtPorts = allPorts.filter(port => !port.pnpId?.includes('BTHENUM'));

  const userPortOptions = nonBtPorts.map(port => Object.fromEntries(Object.entries(port).filter(([key, value]) => value !== undefined)))

  let selectedPort
  // display options to user

  
  //return selectedPort.path
}

// Settings passed to port. Will need to be updated once user's are responsible for setting
const SCALE_SETTINGS = {
  path: 'COM4', // await findPort(),
  baudRate: 9600,
  dataBits: 8,
  parity: "none",
  stopBits: 1
}

// Extracts the number and unit from the received data
const extractData = (data) => {
  const match = data.match(/(-?\d+\.?\d*)\s*([a-zA-Z]+)/);

  if (match) {
    const number = parseFloat(match[1]);
    if (!isNaN(number)) {
      return {
        weight: number,
        unit: match[2]
      }
    }
  }
  return null
}

// Retrieves the current output of the balance
const getCurrentWeight = async () => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for weight'));
      if (port.isOpen) port.close();
    }, 5000);

    // Create new connection
    const port = new SerialPort(SCALE_SETTINGS);

    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    // Get the first data that comes in
    parser.once('data', (data) => {
        const weight = extractData(data);

        if (weight !== null) {
      clearTimeout(timeout);
      port.close(() => {
        resolve(weight)
      })
    } else {
    clearTimeout(timeout)
    reject("Error reading data from balance")
    }
    });

    port.on('error', (err) => {
      clearTimeout(timeout);
      if (port.isOpen) port.close();
      reject(err);
    });
  });
}

//Tares the balance
const tare = async () => {
    const port = new SerialPort(SCALE_SETTINGS)

    return new Promise((resolve, reject) => {
      port.on('open', () => {
            port.write(`T\r\n`);
            setTimeout(() => {
              port.close();
              resolve('Tared successfully')
            }, 3000);
      });

      port.on('error', (err) => {
        port.close();
        reject(err);
      })
    })
}

// Creates a delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Logs a countdown message
const asyncCountdown = async (seconds, message) => {
  for (let i = seconds; i > 0; i--) {
    console.log(`${message} ${i}...`);
    await delay(1000);
  }
}

// Test workflow of taring then reading. 
(async () => {
  await asyncCountdown(5, "Please ensure scale is clear. Taring in");
  await tare();

  console.log("Please place item on scale");
  await delay(5000);

  const test = await getCurrentWeight()
  console.log(test)
})();
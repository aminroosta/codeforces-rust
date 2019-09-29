const puppeteer       = require('puppeteer');
const commandLineArgs = require('command-line-args')
const fs              = require('fs');

// cs -c 1221                   # clone contest 1221
// cs -s a                      # submit solution a
const options = commandLineArgs([
  { name: 'contest', alias: 'c', type: String },
  { name: 'submit', alias: 's', type: String }
]);


async function clone_contest(number) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const url = `https://codeforces.com/contest/${number}`;
  console.warn(`openning ${url} ...`);
  await page.goto(url);
  const ids = await page.evaluate(() => {
    const ids = document.querySelectorAll('table.problems tr td.id')
    return [].map.call(ids, id => id.textContent.trim());
  });
  console.warn(`Found ${ids.length} problems : ${ids.join(', ')}`);
  for(let id of ids) {
    const suburl = `${url}/problem/${id}`;
    console.warn(`openning ${suburl} ...`);
    await page.goto(suburl);
    await page.waitForSelector('.sample-test');
    const input_outputs = await page.evaluate(() => {
        const inputs  = document.querySelectorAll('.sample-test .input pre');
        const outputs = document.querySelectorAll('.sample-test .output pre');
        return {
            inputs : [].map.call(inputs, id => id.textContent.trim()),
            outputs: [].map.call(outputs, id => id.textContent.trim()),
        };
    });
    if (!fs.existsSync('./src')){ fs.mkdirSync('./src'); }
    if (!fs.existsSync('./src/bin')){ fs.mkdirSync('./src/bin'); }
    write_question({
        inputs : input_outputs.inputs,
        outputs: input_outputs.outputs,
        url    : suburl,
        id     : id,
    });
  };

  console.warn('done');
  await browser.close();
}


(async () => {
  if (options.contest) {
    await clone_contest(options.contest);
  } else if(options.submit) {
    console.warn("TODO: submit", contest.submit);
  } else {
    console.warn(`EROOR, USEAGE ↓
      cs -c 1221  # clone contest 1221
      cs -s a     # submit solution a
    `);
  }
})();



function write_question({inputs, outputs, url, id}) {
let template = `// ${url}
macro_rules! input {
    ($s:expr, $($r:tt)*) => {
        let mut iter = $s.split_whitespace();
        input_inner!{iter, $($r)*}
    };
}

macro_rules! input_inner {
    ($iter:expr) => {};
    ($iter:expr, ) => {};
    ($iter:expr, $var:ident : $t:tt $($r:tt)*) => {
        let $var = read_value!($iter, $t);
        input_inner!{$iter $($r)*}
    };
}

macro_rules! read_value {
    ($iter:expr, ( $($t:tt),* )) => {
        ( $(read_value!($iter, $t)),* )
    };
    ($iter:expr, [ $t:tt ; $len:expr ]) => {
        (0..$len).map(|_| read_value!($iter, $t)).collect::<Vec<_>>()
    };
    ($iter:expr, chars) => {
        read_value!($iter, String).chars().collect::<Vec<char>>()
    };
    ($iter:expr, usize1) => {
        read_value!($iter, usize) - 1
    };
    ($iter:expr, $t:ty) => {
        $iter.next().unwrap().parse::<$t>().expect("Parse error")
    };
}

use std::str;
use std::io::Write;
use std::io::BufWriter;

fn run(out : &mut BufWriter<impl Write>, src: &str) {
    input! {
        src,
    }
    // writeln!(out, "{}", result).unwrap();
}

fn main() {
    let out = std::io::stdout();
    let mut out = std::io::BufWriter::new(out.lock());
    let s = {
        use std::io::Read;
        let mut s = String::new();
        std::io::stdin().read_to_string(&mut s).unwrap();
        s
    };
    run(&mut out, &s);
}
`;
 
for(let i = 0; i < inputs.length; ++i) {
    const input = inputs[i];
    const output = outputs[i];
    template += `
#[test]
fn test_${i}() {
    let vec = Vec::new();
    let mut out = BufWriter::with_capacity(100, vec);
    run(&mut out,
        "${input}"
    );

    let vec = out.into_inner().unwrap();
    let result = str::from_utf8(&vec).unwrap();
    assert_eq!(result.trim(), "${output}");
}`;
}

    const file = `./src/bin/${options.contest}_${id}.rs`;
    console.warn(`created file ${file}.`);
    fs.writeFileSync(file, template);
};

#!/usr/bin/env node
const puppeteer = require("puppeteer");
const commandLineArgs = require("command-line-args");
const fs = require("fs");
const { join, resolve } = require("path");
const readline = require("readline-sync");
const execSync = require("child_process").execSync;

// cs -c 1221                   # clone contest 1221
// cs -s a                      # submit solution a
const options = commandLineArgs([
  { name: "contest", alias: "c", type: String },
  { name: "submit", alias: "s", type: String },
]);

async function clone_contest(number) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const url = `https://codeforces.com/contest/${number}`;
  console.warn(`openning ${url} ...`);
  await page.goto(url);
  const ids = await page.evaluate(() => {
    const ids = document.querySelectorAll("table.problems tr td.id");
    return [].map.call(ids, (id) => id.textContent.trim().toLowerCase());
  });
  console.warn(`Found ${ids.length} problems : ${ids.join(", ")}`);
  for (let id of ids) {
    const suburl = `${url}/problem/${id}`;
    console.warn(`openning ${suburl} ...`);
    await page.goto(suburl);
    await page.waitForSelector(".sample-test");
    const input_outputs = await page.evaluate(() => {
      const inputs = document.querySelectorAll(".sample-test .input pre");
      const outputs = document.querySelectorAll(".sample-test .output pre");
      return {
        inputs: [].map.call(inputs, (pre) => {
          const divs = pre.querySelectorAll("div");
          if (divs.length) {
            return [].map
              .call(pre.querySelectorAll("div"), (div) =>
                div.textContent.trim()
              )
              .join("\n");
          } else {
            return pre.textContent.trim();
          }
        }),
        outputs: [].map.call(outputs, (pre) => pre.textContent.trim()),
      };
    });
    if (!fs.existsSync("./src")) {
      fs.mkdirSync("./src");
    }
    if (!fs.existsSync("./src/bin")) {
      fs.mkdirSync("./src/bin");
    }
    write_question({
      inputs: input_outputs.inputs,
      outputs: input_outputs.outputs,
      url: suburl,
      id: id,
    });
  }

  console.warn("done");
  await browser.close();
}

async function submit_problem(submit) {
  let username, password;
  const cred_file = join(__dirname, "cred");
  if (!fs.existsSync(cred_file)) {
    username = readline.question("username : ");
    password = readline.question("password : ", { hideEchoBack: true });
  } else {
    const cred_json = fs.readFileSync(cred_file, "utf8");
    const cred = JSON.parse(cred_json);
    username = cred.username;
    password = cred.password;
  }

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const url = "https://codeforces.com/enter";
  console.warn(`openning ${url} ...`);
  await page.goto(url);
  await page.$eval("#handleOrEmail", (el, v) => (el.value = v), username);
  await page.$eval("#password", (el, v) => (el.value = v), password);
  await page.click('input[type="submit"]');
  await page.waitForSelector(`a[href$="${username}"]`);
  fs.writeFileSync(cred_file, JSON.stringify({ username, password }));

  const file_path = resolve(submit);
  const suburl = fs
    .readFileSync(file_path, "utf8")
    .split("\n")[0]
    .replace(/^\/\/\s*/, "");
  console.warn(`openning ${suburl} ...`);
  await page.goto(suburl);
  await page.waitForSelector('input[name="sourceFile"]');
  await page.$eval('select[name="programTypeId"]', (el) => (el.value = "75"));
  const input = await page.$('input[name="sourceFile"]');
  await input.uploadFile(file_path);

  console.warn(`submitting ${submit} ...`);
  await page.click("form.submitForm input[type=submit]");
  await page.waitForSelector("table tr[data-submission-id], .error");

  const error = await page.evaluate(() => {
    const error = document.querySelector(".error");
    return error && error.textContent;
  });
  if (error) {
    console.log(`\x1b[31m${error}`);
    await browser.close();
    return;
  }

  while (1) {
    const data = await page.evaluate(() => {
      const trs = Array.from(
        document.querySelectorAll("table tr[data-submission-id]")
      );
      const data = {};
      trs.slice(0, 1).map((tr) => {
        const tds = Array.from(tr.querySelectorAll("td"));
        const [id, when, _who, problem, lang, verdict, time, memory] = tds.map(
          (td) => td.textContent.trim()
        );
        data[id] = { when, problem, lang, verdict, time, memory };
      });
      return data;
    });
    console.table(data);
    const is_running =
      JSON.stringify(data).indexOf("queue") !== -1 ||
      JSON.stringify(data).indexOf("Running") !== -1;
    if (is_running) {
      execSync("sleep 1");
      // await page.reload();
    } else {
      await browser.close();
      return;
    }
  }
}

(async () => {
  if (options.contest) {
    await clone_contest(options.contest);
  } else if (options.submit) {
    await submit_problem(options.submit);
  } else {
    console.warn(`EROOR, USEAGE ↓
      cs -c 1221  # clone contest 1221
      cs -s a     # submit solution a
    `);
  }
})();

function write_question({ inputs, outputs, url, id }) {
  let template = `// ${url}
macro_rules! input{
    ($iter:expr) => {};
    ($iter:expr,) => {};
    (src = $s:expr, $($r:tt)*) => {
        let mut iter = $s.split_whitespace();
        input!{iter, $($r)*}
    };
    ($iter:expr, $var:ident : $t:tt $($r:tt)*) => {
        let $var = read_value!($iter, $t);
        input!{$iter $($r)*}
    };
}
macro_rules! read_value {
    ($iter:expr, ($($t:tt),* )) => { ( $(read_value!($iter, $t)),* ) };
    ($iter:expr, [$t:tt;]) => { read_value!($iter, [$t; read_value!($iter, usize)]) };
    ($iter:expr, [$t:tt;$len:expr]) => {
        (0..$len).map(|_| read_value!($iter, $t)).collect::<Vec<_>>()
    };
    ($iter:expr, chars) => {
        read_value!($iter, String).chars().collect::<Vec<char>>()
    };
    ($iter:expr, $t:ty) => {
        $iter.next().unwrap().parse::<$t>().expect("Parse error")
    };
}

use std::io::BufWriter;
use std::io::Write;
use std::str;

fn run(out: &mut BufWriter<impl Write>, src: &str) {
    input! {
        src = src,
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

  for (let i = 0; i < inputs.length; ++i) {
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
}

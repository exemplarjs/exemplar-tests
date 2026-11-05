import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as ExemplarDom from '@exemplarjs/dom';
import type * as ExemplarWriter from '@exemplarjs/writer';
import type * as ExemplarXdm from '@exemplarjs/xdm';
import type * as Exemplar from '@exemplarjs/xml';
import type * as ExemplarFiles from '@exemplarjs/xml/resolvers/file';
import type * as ExemplarXPath from '@exemplarjs/xpath';
import { type Adapter, XPATH_WORKLOADS } from './adapter.ts';
import { exemplarXPathAdapterFor } from './exemplar-xpath.ts';
import { exemplarAdapter, timedWorkloads } from './exemplar.ts';
import { withXPath } from './xpath-workload.ts';

/** Loads one built module. */
async function load<T>(file: string): Promise<T> {
  return (await import(pathToFileURL(file).href)) as T;
}

/** Where a built checkout keeps its modules; one from before the split keeps them in `packages/exemplar` and has no XDM or XPath. */
function modules(checkout: string) {
  const single = path.join(checkout, 'packages/exemplar/dist');
  if (existsSync(single)) {
    return {
      core: path.join(single, 'index.js'),
      dom: path.join(single, 'dom/index.js'),
      writer: path.join(single, 'writer/index.js'),
      files: path.join(single, 'resolvers/file.js'),
    };
  }
  const built = (name: string, module = 'index.js'): string => path.join(checkout, 'packages', name, 'dist', module);
  return {
    core: built('xml'),
    dom: built('dom'),
    xdm: built('xdm'),
    xpath: built('xpath'),
    writer: built('writer'),
    files: built('xml', 'resolvers/file.js'),
  };
}

/** exemplar as another built checkout has it, such as `main`'s, timed beside this one; its output is checked as this build's. */
export async function exemplarBuildAdapter(checkout: string, name: string, version: string): Promise<Adapter> {
  const files = modules(checkout);
  const core = await load<typeof Exemplar>(files.core);
  const dom = await load<typeof ExemplarDom>(files.dom);
  const writer = await load<typeof ExemplarWriter>(files.writer);
  const quiet = { error: () => undefined, warning: () => undefined };
  const read = new core.XMLInputFactory({ errorHandler: quiet });
  // A build without a file resolver cannot read DTDs from files, and so has no `dtd` workload.
  const resolvers = existsSync(files.files) ? await load<typeof ExemplarFiles>(files.files) : undefined;
  const dtd = resolvers?.fileResolver;
  // A build from before the xdm package has no `xdm` workload.
  const xdm = files.xdm !== undefined && existsSync(files.xdm) ? await load<typeof ExemplarXdm>(files.xdm) : undefined;
  // A build from before the xpath package has no `xpath` workload.
  const xpath =
    xdm && files.xpath !== undefined && existsSync(files.xpath)
      ? await load<typeof ExemplarXPath>(files.xpath)
      : undefined;
  const timed = timedWorkloads({
    read,
    tree: new dom.DocumentBuilder(read),
    ...(xdm && { xdm: new xdm.XdmDocumentBuilder(read) }),
    write: new writer.XMLOutputFactory(),
    sink: () => new writer.StringSink(),
    ...(dtd && {
      dtd: (root: string) =>
        new core.XMLInputFactory({
          errorHandler: quiet,
          accessExternalDTD: ['file'],
          accessExternalEntities: ['file'],
          entityResolver: dtd({ root }),
        }),
    }),
  });
  const workloads = exemplarAdapter.workloads.filter(
    (workload) =>
      !XPATH_WORKLOADS.has(workload) &&
      (workload !== 'dtd' || dtd !== undefined) &&
      (workload !== 'xdm' || xdm !== undefined)
  );
  const adapter: Adapter = { ...exemplarAdapter, ...timed, name, version, workloads };
  if (!xdm || !xpath) return adapter;
  return withXPath(
    adapter,
    exemplarXPathAdapterFor({ Compiler: xpath.XPathCompiler, builder: new xdm.XdmDocumentBuilder(read), version })
  );
}

# oja actions app example

An example of structuring app business logic using [Oja](https://github.com/eBay/oja#readme) actions.

This demo application demonstrates how application business logic can be structured into independent, shareable actions that can be tested independently and later used to compose more complex actions/pages/responses.

The application uses code generation to automate action and component creation and that includes unit tests generation as well.

<p align="center">
    <img src="demo.gif" width="1000"/>
</p>

## Usage

### Install
```bash
cd examples
yarn
```

### Running tests

```bash
yarn test
```

### Running app
```bash
node .
```

### New action via code generation

To speed up the process of creating new actions and controllers and required unit tests, the application uses (https://github.com/eBay/oja/blob/master/packages/hygen-oja-generators#readme), a [hygen](https://www.hygen.io/) code generation plugin.

Once you install the templates, you can start extending them with your own templates.

#### Install hygen plugin

```bash
npm install hygen -g
npm install hygen-add -g
cd <your app dir>
hygen-add oja-generators
```

#### Init oja

```bash
hygen oja init
```

#### Create new action

```bash
hygen action new <action namespace> [--target <target dir>]
# example
# hygen action new consumer/buy
```

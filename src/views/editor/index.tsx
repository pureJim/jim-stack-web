import { Button } from 'antd';
import Editor from './components/LexicalEditor';

const EditorPage = () => {
  return (
    <div>
      <h1>Editor</h1>
      <Button type="primary">Button</Button>
      <Editor />
    </div>
  );
};

export default EditorPage;

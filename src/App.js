import React, { Component } from 'react';
import './App.css';
import PouchDB from 'pouchdb';

var db = new PouchDB('recipes');

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      displayingRecipeId: null,
    };
  }

  onRecipeClosed = () => {
    this.setState({ displayingRecipeId: null });

    // Tell the list to refresh itself
    this.recipeListRef.fetchAllRecipes();
  };

  onRecipeLaunched = (recipeId) => {
    this.setState({ displayingRecipeId: recipeId });
  };

  render() {
    return (
      <div>
        <RecipeList hide={Boolean(this.state.displayingRecipeId)}
                    onRecipeLaunched={this.onRecipeLaunched} 
                    ref={(r) => { this.recipeListRef = r; }} />

        { this.state.displayingRecipeId &&
          <RecipeEditor recipeId={this.state.displayingRecipeId} 
                        onRecipeClosed={this.onRecipeClosed}/>
        }
      </div>
    );
  }
}

function anyRecipeChanges(savedDoc, workingDoc){
  return savedDoc.title !== workingDoc.title ||
         savedDoc.originalRecipeText !== workingDoc.originalRecipeText ||
         savedDoc.currentRecipeText !== workingDoc.currentRecipeText
}

class RecipeList extends Component {
  constructor(props) {
    super(props);

    this.state = { 
      recipes: [] 
    };
  }

  fetchAllRecipes = () => {
    db.allDocs({include_docs: true}, (err, allDocs) => {
      if (err) return console.error(err);

      this.setState({ 
        recipes: allDocs.rows
          .filter((docMeta) => Boolean(docMeta.doc.title)) // Ignore empty recipes
          .map( (docMeta) => ({ 
            id: docMeta.doc._id, 
            title: docMeta.doc.title 
          }))
      });
    });    
  }

  onAddNewRecipeClicked = () => {
    // create a new, empty recipe 
    db.post({}, (err, result) => {
      if (err) return console.error(err);

      this.props.onRecipeLaunched(result.id);
    });
  };

  onRecipeLaunched = (recipeId) => {
    this.props.onRecipeLaunched(recipeId);
  };

  componentDidMount() {
    this.fetchAllRecipes();
  }

  render() {
    return (
      <div className={"recipe-list-screen full-screen-container" + (this.props.hide ? " hidden" : "")}>
        <div className="recipe-list-header">
          <div className="recipe-list-title">
            <span className="vertically-centered-span">Recipes</span>
          </div>
          <button type="button" className="add-recipe-button" onClick={this.onAddNewRecipeClicked} >+</button>
        </div>
        <div className="recipe-list-background">
          {this.state.recipes.map((recipe) => 
            <div key={recipe.id}>
              <button type="button" onClick={(e) => this.onRecipeLaunched(recipe.id)} >{recipe.title}</button>
            </div>
            )}
        </div>
      </div>
    );    
  }
}


class RecipeEditor extends Component {
  constructor(props) {
    super(props);

    this.state = { 
      loading: true
    };
  }

  updateRecipeDocumentIfChanged = (callback) => {
    if (anyRecipeChanges(this.state.savedDoc, this.state)) {
      var updatedDoc = {
        _id: this.state.savedDoc._id,
        _rev: this.state.savedDoc._rev,
        title: this.state.title,
        originalRecipeText: this.state.originalRecipeText,
        currentRecipeText: this.state.currentRecipeText
      };

      db.put(updatedDoc, (err, response) => {
        if (err) return console.error(err);

        // Successful save
        updatedDoc._rev = response.rev;

        this.setState( { savedDoc: updatedDoc }, () => {
          if (callback) callback();
        });
      });
    }
    else {
      // Save not needed
      if (callback) callback();
    }
  };

  onTitleChanged = (event) => {
    this.setState({ title: event.target.value });
  };

  onOriginalRecipeTextChanged = (event) => {  
    this.setState({ originalRecipeText: event.target.value });
  };

  onCurrentRecipeTextChanged = (event) => {  
    this.setState({ currentRecipeText: event.target.value });
  };

  onOriginalButtonClicked = () => {
    this.setState({ version: 'original'}, () => {
      this.originalTextInputRef.focus();
    });
  };

  onCurrentButtonClicked = () => {
    this.setState({ version: 'current'}, () => {
      this.currentTextInputRef.focus();
    });
  };

  onDeleteButtonClicked = () => {
    db.remove(this.state.savedDoc._id, this.state.savedDoc._rev, (err, response) => {
      if (err) return console.error(err);
      
      this.setState({ isDeleted: true });
      this.props.onRecipeClosed();
    });
  };

  onCloseButtonClicked = () => {
    // First save any changes and then close the recipe

    this.updateRecipeDocumentIfChanged(() => {
      this.props.onRecipeClosed();
    })
  };

  onTimerTick = () => {
    this.updateRecipeDocumentIfChanged();
  };

  componentDidMount() {
    // Loading: grab the full recipe from the database
    db.get(this.props.recipeId, (err, doc) => {
      if (err) return console.error(err);

      var state = { 
        loading: false, 
        savedDoc: doc,

        // Stop silly react warning about changing from uncontrolled to controlled input 
        title: '',
      };

      if (doc.title) {
        state.title = doc.title;
      }

      state.version = 'original';

      if (doc.originalRecipeText) {
        state.originalRecipeText = doc.originalRecipeText;
      }

      if (doc.currentRecipeText) {
        state.currentRecipeText = doc.currentRecipeText;
        state.version = 'current';
      }

      this.setState( state, () => {
        // Update the cursor positions in the textboxes
        if (this.state.originalRecipeText)
        {
          // Reset the cursor to the start of the text
          this.originalTextInputRef.setSelectionRange(0, 0);
        }
        
        if (this.state.currentRecipeText)
        {
          // Reset the cursor to the start of the text
          this.currentTextInputRef.setSelectionRange(0, 0);
        }

        // Focus on either the title or the visible recipe text
        if (!doc.title) {
          this.titleTextInputRef.focus();
        }
        else if (this.state.version === 'original') {
          this.originalTextInputRef.focus();
        }
        else {
          this.currentTextInputRef.focus();
        }
      })
    });

    // Set up timer to update the database on any changes
    this.timerId = setInterval(() => this.onTimerTick(), 3000);
  }

  componentWillUnmount() {
    clearInterval(this.timerId);
  }

  render() {
    const isOriginal = this.state.version === 'original';
    const isCurrent = this.state.version === 'current';

    if (this.state.loading || this.state.isDeleted) {
      return null;
    }

    return (
      <div className="recipe-editor-screen full-screen-container">
        <div className="recipe-header">
          <button type="button" className="back-button" onClick={this.onCloseButtonClicked} >&lt;-</button>
          <div className="picture-slot"></div>

          <input type="text" value={this.state.title} onChange={this.onTitleChanged} ref={(input) => { this.titleTextInputRef = input; }} />

          <button type="button" className={"original-button" + (isOriginal ? " selected-button" : "")} onClick={this.onOriginalButtonClicked} >Original</button>
          <button type="button" className={"current-button" +  (isCurrent ? " selected-button" : "")} onClick={this.onCurrentButtonClicked} >Current</button>
          <button type="button" className="delete-button" onClick={this.onDeleteButtonClicked} >X</button>
        </div>

        <textarea className={"recipe-text" + (!isOriginal ? " hidden" : "")} value={this.state.originalRecipeText} onChange={this.onOriginalRecipeTextChanged} ref={(input) => { this.originalTextInputRef = input; }} />
        <textarea className={"recipe-text" + (!isCurrent ? " hidden" : "")} value={this.state.currentRecipeText} onChange={this.onCurrentRecipeTextChanged} ref={(input) => { this.currentTextInputRef = input; }} />

        <textarea className="rules-text" value="Rules" readOnly="true" />

        <div className="preview">

        </div>
      </div>
    );
  }
}

export default App;
